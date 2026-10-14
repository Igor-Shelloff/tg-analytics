import asyncio
import os
import threading
from concurrent.futures import Future
from datetime import datetime
from typing import Any, Callable, Coroutine, Optional

from telethon import TelegramClient as TelethonClient
from telethon.tl.types import (
    Channel, Chat, MessageMediaPhoto, MessageMediaDocument,
)
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PasswordHashInvalidError,
    PhoneNumberInvalidError,
    ApiIdInvalidError,
    AuthKeyUnregisteredError,
    SessionRevokedError,
    UserDeactivatedBanError,
    UserDeactivatedError,
    FloodWaitError,
    UsernameInvalidError,
    UsernameNotOccupiedError,
    ChannelPrivateError,
    ChannelInvalidError,
)

from .config import SESSIONS_DIR

SESSION_PATH = SESSIONS_DIR / "tg_analytics"

LogCallback = Callable[[str], None]

class TelegramWorker:
    def __init__(self):
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="tg-loop",
        )
        self._thread.start()

        self._client: Optional[TelethonClient] = None
        self._client_lock = threading.Lock()

        self._auth_event = threading.Event()
        self._auth_code: Optional[str] = None
        self._auth_password: Optional[str] = None

    def _run(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def create_client(self, api_id: int, api_hash: str) -> TelethonClient:
        with self._client_lock:
            if self._client is not None:
                return self._client
            self._client = TelethonClient(
                str(SESSION_PATH), api_id, api_hash,
                device_model="TG Analytics",
                system_version="1.0",
            )
            return self._client

    @property
    def client(self) -> Optional[TelethonClient]:
        return self._client

    def submit(self, coro: Coroutine[Any, Any, Any]) -> Future:
        return asyncio.run_coroutine_threadsafe(coro, self._loop)

    def shutdown(self):
        try:
            self._loop.call_soon_threadsafe(self._loop.stop)
        except RuntimeError:
            pass

    def has_session_file(self) -> bool:
        return os.path.exists(str(SESSION_PATH) + ".session")

    def remove_session_file(self):
        base = str(SESSION_PATH) + ".session"
        for suffix in ("", "-journal", "-wal", "-shm"):
            p = base + suffix
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass

    def logout(self):
        async def _do():
            try:
                if self._client and self._client.is_connected():
                    await self._client.log_out()
            except Exception:
                pass
        try:
            self.submit(_do()).result(timeout=10)
        except Exception:
            pass
        with self._client_lock:
            self._client = None
        self.remove_session_file()

    def submit_code(self, code: str):
        self._auth_code = code
        self._auth_event.set()

    def submit_password(self, password: str):
        self._auth_password = password
        self._auth_event.set()

    def cancel_auth_wait(self):
        self._auth_code = None
        self._auth_password = None
        self._auth_event.set()

    def try_restore_session(self, api_id: int, api_hash: str,
                             on_log: LogCallback) -> Future:
        self.create_client(api_id, api_hash)
        return self.submit(self._restore_session_async(on_log))

    async def _restore_session_async(self, log: LogCallback):
        client = self._client
        try:
            if not client.is_connected():
                await client.connect()
            if await client.is_user_authorized():
                me = await client.get_me()
                name = self._user_display(me)
                return True, name
            return False, "not authorized"
        except (AuthKeyUnregisteredError, SessionRevokedError,
                UserDeactivatedBanError, UserDeactivatedError):
            return False, "session dead"
        except Exception as e:
            return False, str(e)

    def authorize_sms(self, api_id: int, api_hash: str, phone: str,
                       on_log: LogCallback,
                       on_code_needed: Callable[[], None],
                       on_password_needed: Callable[[], None]) -> Future:
        self.create_client(api_id, api_hash)
        return self.submit(self._authorize_sms_async(
            phone, on_log, on_code_needed, on_password_needed,
        ))

    async def _authorize_sms_async(self, phone, log,
                                    on_code_needed, on_password_needed):
        client = self._client
        try:
            if not client.is_connected():
                await client.connect()
                log("Connected to Telegram")

            if await client.is_user_authorized():
                me = await client.get_me()
                return True, self._user_display(me)

            log(f"Sending code request to {phone}")
            try:
                sent = await client.send_code_request(phone)
            except PhoneNumberInvalidError:
                return False, "invalid phone number"

            log(f"Code sent ({type(sent.type).__name__})")
            on_code_needed()

            self._auth_event.clear()
            if not self._auth_event.wait(timeout=180):
                return False, "timeout"
            code = self._auth_code
            if not code:
                return False, "cancelled"

            try:
                await client.sign_in(
                    phone, code, phone_code_hash=sent.phone_code_hash,
                )
            except SessionPasswordNeededError:
                log("2FA password required")
                on_password_needed()
                self._auth_event.clear()
                if not self._auth_event.wait(timeout=180):
                    return False, "timeout"
                pwd = self._auth_password
                if not pwd:
                    return False, "cancelled"
                try:
                    await client.sign_in(password=pwd)
                except PasswordHashInvalidError:
                    return False, "invalid password"
            except PhoneCodeInvalidError:
                return False, "invalid code"
            except PhoneCodeExpiredError:
                return False, "code expired"

            me = await client.get_me()
            log(f"Authorization successful: {self._user_display(me)}")
            return True, self._user_display(me)

        except ApiIdInvalidError:
            return False, "invalid api credentials"
        except Exception as e:
            return False, str(e)

    def authorize_qr(self, api_id: int, api_hash: str,
                      on_log: LogCallback,
                      on_qr_url: Callable[[str], None],
                      on_password_needed: Callable[[], None]) -> Future:
        self.create_client(api_id, api_hash)
        return self.submit(self._authorize_qr_async(
            on_log, on_qr_url, on_password_needed,
        ))

    async def _authorize_qr_async(self, log, on_qr_url, on_password_needed):
        client = self._client
        try:
            if not client.is_connected():
                await client.connect()
                log("Connected to Telegram")

            if await client.is_user_authorized():
                me = await client.get_me()
                return True, self._user_display(me)

            log("Requesting QR login")
            qr_login = await client.qr_login()
            on_qr_url(qr_login.url)

            try:
                await qr_login.wait(timeout=180)
            except asyncio.TimeoutError:
                return False, "timeout"
            except SessionPasswordNeededError:
                log("2FA password required")
                on_password_needed()
                self._auth_event.clear()
                if not self._auth_event.wait(timeout=180):
                    return False, "timeout"
                pwd = self._auth_password
                if not pwd:
                    return False, "cancelled"
                try:
                    await client.sign_in(password=pwd)
                except PasswordHashInvalidError:
                    return False, "invalid password"

            me = await client.get_me()
            return True, self._user_display(me)
        except Exception as e:
            return False, str(e)

    async def _list_admin_channels_async(self, log: LogCallback):
        client = self._client
        if not client:
            return False, "no client", []
        try:
            if not await client.is_user_authorized():
                return False, "not authorized", []

            result = []
            async for dialog in client.iter_dialogs():
                entity = dialog.entity
                if not isinstance(entity, Channel):
                    continue
                if not getattr(entity, "broadcast", False):
                    continue
                is_creator = bool(getattr(entity, "creator", False))
                admin_rights = getattr(entity, "admin_rights", None)
                if not (is_creator or admin_rights is not None):
                    continue

                result.append({
                    "tg_id": entity.id,
                    "username": getattr(entity, "username", None) or "",
                    "title": entity.title or "Untitled",
                    "participants_count":
                        getattr(entity, "participants_count", 0) or 0,
                    "is_creator": is_creator,
                    "is_public": False,
                })
            return True, "", result
        except FloodWaitError as e:
            log(f"FloodWait {e.seconds}s")
            await asyncio.sleep(e.seconds)
            return False, f"flood wait {e.seconds}s", []
        except Exception as e:
            log(f"List dialogs failed: {e}")
            return False, str(e), []

    def list_admin_channels(self, on_log: LogCallback):
        done = threading.Event()
        box = {"ok": False, "message": "", "items": []}

        async def _run():
            ok, msg, items = await self._list_admin_channels_async(on_log)
            box["ok"] = ok
            box["message"] = msg
            box["items"] = items

        fut = self.submit(_run())
        fut.add_done_callback(lambda _: done.set())
        done.wait(timeout=90)
        return box

    async def _resolve_channel_async(self, identifier: str,
                                      log: LogCallback):
        client = self._client
        if not client:
            return False, "no client", {}
        try:
            if not client.is_connected():
                await client.connect()
            if not await client.is_user_authorized():
                return False, "not authorized", []

            s = (identifier or "").strip()
            if s.startswith("https://t.me/"):
                s = s[len("https://t.me/"):]
            elif s.startswith("http://t.me/"):
                s = s[len("http://t.me/"):]
            elif s.startswith("t.me/"):
                s = s[len("t.me/"):]
            elif s.startswith("@"):
                s = s[1:]

            if "?" in s:
                s = s.split("?", 1)[0]

            if "/" in s:
                s = s.split("/", 1)[0]

            if not s:
                return False, "empty identifier", {}

            log(f"Resolving @{s}")

            try:
                entity = await client.get_entity(s)
            except (UsernameInvalidError, UsernameNotOccupiedError):
                return False, "username not found", {}
            except ChannelPrivateError:
                return False, "channel is private", {}
            except ChannelInvalidError:
                return False, "invalid channel", {}

            if not isinstance(entity, Channel):

                if isinstance(entity, Chat):
                    return False, "this is a group, not a channel", {}
                return False, "not a channel", {}

            is_broadcast = bool(getattr(entity, "broadcast", False))

            try:
                full = await client(GetFullChannelRequest(channel=entity))
                subs = full.full_chat.participants_count or 0
            except Exception:
                subs = getattr(entity, "participants_count", 0) or 0

            info = {
                "tg_id": entity.id,
                "username": getattr(entity, "username", None) or "",
                "title": entity.title or "Untitled",
                "participants_count": subs,
                "is_broadcast": is_broadcast,
                "is_public": True,
                "is_creator": bool(getattr(entity, "creator", False)),
            }
            return True, "", info

        except FloodWaitError as e:
            log(f"FloodWait {e.seconds}s")
            await asyncio.sleep(e.seconds)
            return False, f"flood wait {e.seconds}s", {}
        except Exception as e:
            log(f"Resolve failed: {e}")
            return False, str(e), {}

    def resolve_channel(self, identifier: str, on_log: LogCallback):
        done = threading.Event()
        box = {"ok": False, "message": "", "data": {}}

        async def _run():
            ok, msg, data = await self._resolve_channel_async(identifier, on_log)
            box["ok"] = ok
            box["message"] = msg
            box["data"] = data

        fut = self.submit(_run())
        fut.add_done_callback(lambda _: done.set())
        done.wait(timeout=60)
        return box

    async def _collect_channel_async(self, tg_id: int, log: LogCallback,
                                      max_posts: int = 100):
        client = self._client
        if not client:
            return False, "no client", {}
        try:
            entity = await client.get_entity(tg_id)

            try:
                full = await client(GetFullChannelRequest(channel=entity))
                subscribers = full.full_chat.participants_count or 0
            except Exception:
                subscribers = getattr(entity, "participants_count", 0) or 0

            posts = []
            count = 0
            async for msg in client.iter_messages(entity, limit=max_posts):
                if not msg or not msg.id:
                    continue
                posts.append(self._msg_to_post(msg))
                count += 1
                if count % 20 == 0:
                    await asyncio.sleep(0.5)

            return True, "", {
                "tg_id": tg_id,
                "title": entity.title or "Untitled",
                "username": getattr(entity, "username", None) or "",
                "subscribers": subscribers,
                "posts": posts,
            }
        except FloodWaitError as e:
            log(f"FloodWait {e.seconds}s while collecting")
            await asyncio.sleep(e.seconds)
            return False, f"flood wait {e.seconds}s", {}
        except Exception as e:
            log(f"Collect failed: {e}")
            return False, str(e), {}

    def collect_channel(self, tg_id: int, on_log: LogCallback,
                         max_posts: int = 100):
        done = threading.Event()
        box = {"ok": False, "message": "", "data": {}}

        async def _run():
            ok, msg, data = await self._collect_channel_async(
                tg_id, on_log, max_posts,
            )
            box["ok"] = ok
            box["message"] = msg
            box["data"] = data

        fut = self.submit(_run())
        fut.add_done_callback(lambda _: done.set())
        done.wait(timeout=300)
        return box

    @staticmethod
    def _msg_to_post(msg) -> dict:
        media_type = None
        has_media = 0

        if getattr(msg, "media", None):
            has_media = 1
            if isinstance(msg.media, MessageMediaPhoto):
                media_type = "photo"
            elif isinstance(msg.media, MessageMediaDocument):
                doc = msg.media.document
                mt = (getattr(doc, "mime_type", "") or "") if doc else ""
                if "video" in mt:
                    media_type = "video"
                elif "image" in mt:
                    media_type = "photo"
                else:
                    media_type = "document"
            elif getattr(msg, "poll", None):
                media_type = "poll"
            else:
                media_type = "other"

        reactions = 0
        r = getattr(msg, "reactions", None)
        if r and getattr(r, "results", None):
            for res in r.results:
                reactions += getattr(res, "count", 0) or 0

        date_iso = None
        if getattr(msg, "date", None):
            try:
                date_iso = msg.date.astimezone().replace(
                    tzinfo=None,
                ).isoformat(sep=" ")
            except Exception:
                date_iso = str(msg.date)

        return {
            "tg_msg_id": msg.id,
            "date": date_iso,
            "text": (msg.message or "")[:1000],
            "views": getattr(msg, "views", 0) or 0,
            "reactions": reactions,
            "forwards": getattr(msg, "forwards", 0) or 0,
            "has_media": has_media,
            "media_type": media_type,
        }

    @staticmethod
    def _user_display(me) -> str:
        if not me:
            return "unknown"
        first = getattr(me, "first_name", "") or ""
        last = getattr(me, "last_name", "") or ""
        username = getattr(me, "username", "") or ""
        full = f"{first} {last}".strip() or "Unknown"
        if username:
            full += f" (@{username})"
        return full
