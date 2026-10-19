# Moderation Bot

Bot moderation cho Discord: **mute bằng role**, **cảnh cáo + offence count**, **lịch sử punishment**, **mod log / audit log** (bắt cả thao tác làm ngoài bot).

- **Stack:** Node.js + discord.js v14
- **Database:** SQLite (module `node:sqlite` có sẵn của Node.js — không cần cài DB, không cần native module)
- **Lệnh:** Slash commands, UI tiếng Việt

## Tính năng

| Nhóm | Chi tiết |
| --- | --- |
| Mute | Gán/gỡ role `Muted` (chặn chat + voice từng kênh), mute tạm thời (`/mute user: duration:1h`) hoặc vĩnh viễn; hết hạn tự gỡ (scheduler + khôi phục khi bot restart); thành viên rời server rồi quay lại vẫn bị mute lại |
| Cảnh cáo | `/warn`, xem/xóa cảnh cáo; **auto-mute khi đạt ngưỡng cảnh cáo** (cấu hình bật/tắt) |
| Offence count | Mọi punishment (warn/mute/kick/ban) được đếm thành case; `/offences` xem điểm vi phạm 1 người hoặc top 10 |
| Lịch sử | `/history` xem toàn bộ case của 1 người (phân trang, lọc theo loại); `/case view/delete` |
| Mod log | Mọi hành động của bot (kể cả tự động) được log vào kênh đã cấu hình |
| Audit log | Bắt ban/unban/kick/timeout/thay đổi role Muted làm **trực tiếp qua Discord** và log lại kèm người thực hiện |
| Temp ban | `/ban` kèm `duration` → hết hạn tự unban |

## Yêu cầu

- **Node.js >= 23.4** (khuyến nghị Node 24+; cần `node:sqlite` + `--env-file`)
- Một Discord application ([Developer Portal](https://discord.com/developers/applications))

## Cài đặt

### 1. Tạo bot trên Developer Portal

1. Vào Developer Portal → **New Application** → đặt tên.
2. Tab **Bot** → **Reset Token** → copy token.
3. Tab **Bot** → bật **Server Members Intent** (bắt buộc, để nhận sự kiện member join/leave).
4. Tab **General Information** → copy **Application ID**.

### 2. Mời bot vào server

Link mời (thay `YOUR_CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268520582&scope=bot%20applications.commands
```

Quyền được cấp: `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `Manage Roles`, `Kick Members`, `Ban Members`, `View Audit Log`.

> **Quan trọng:** sau khi mời, kéo role của bot lên **trên** role `Muted` trong Server Settings → Roles.

### 3. Cấu hình và chạy

```bash
npm install
cp .env.example .env      # rồi điền DISCORD_TOKEN + CLIENT_ID
npm run deploy            # đăng ký slash command (điền GUILD_ID vào .env để hiện ngay, không cần chờ)
npm start
```

### 4. Setup trong server (1 lần)

```
/setup log_channel:#mod-log
```

Bot sẽ: tạo role `Muted` → áp overwrite chặn quyền (Send Messages, Add Reactions, Create Threads, Speak...) trên **toàn bộ kênh hiện có** → đặt kênh log. Kênh mới tạo về sau được bot tự áp dụng.

## Danh sách lệnh

| Lệnh | Mô tả | Quyền cần |
| --- | --- | --- |
| `/setup [log_channel]` | Tạo role Muted + đồng bộ chặn quyền toàn server + đặt kênh log | Manage Server |
| `/config show` | Xem cấu hình | Manage Server |
| `/config set-log channel:` | Đặt kênh mod log | Manage Server |
| `/config set-mute-role role:` | Dùng role có sẵn làm role Muted | Manage Server |
| `/config set-mod-role role:` | Cấp quyền dùng lệnh mod cho 1 role | Manage Server |
| `/config set-warn-escalation threshold: duration:` | Bật/tắt auto-mute khi đủ ngưỡng cảnh cáo (`0` = tắt) | Manage Server |
| `/warn user: [reason:]` | Cảnh cáo + tăng offence count | Manage Messages |
| `/warnings list user:` | Xem cảnh cáo (phân trang) | Manage Messages |
| `/warnings clear user: [reason:]` | Xóa cảnh cáo đang hiệu lực | Manage Messages |
| `/mute user: [duration:] [reason:]` | Mute bằng role (bỏ trống duration = vĩnh viễn) | Manage Roles |
| `/unmute user: [reason:]` | Gỡ mute | Manage Roles |
| `/kick user: [reason:]` | Kick | Kick Members |
| `/ban user: [duration:] [reason:] [delete_messages:]` | Ban / temp ban | Ban Members |
| `/unban user_id: [reason:]` | Gỡ ban theo ID | Ban Members |
| `/history user: [type:]` | Lịch sử punishment (phân trang) | Manage Messages |
| `/offences [user:]` | Offence count của 1 người / top 10 | Manage Messages |
| `/case view number:` | Chi tiết 1 case | Manage Messages |
| `/case delete number: [reason:]` | Ẩn case khỏi lịch sử (giữ audit trail) | Manage Server |

> Người có **role moderator** (`/config set-mod-role`) hoặc **Administrator** được dùng mọi lệnh dù không có quyền Discord tương ứng.
> Định dạng duration: `30m`, `2h`, `7d`, `1d12h`; số trần (vd `90`) = 90 phút.

## Cách hoạt động

### Case system
- Mọi punishment tạo 1 **case** đánh số tăng dần theo server (`Case #12`) — kể cả auto-mute, unmute, unban, ghi chú.
- `active = 0` khi hết hạn/bị gỡ → history hiển thị ⚪; `/case delete` thêm `hidden = 1` → ẩn hẳn nhưng vẫn còn trong DB.
- Offence count = tổng số case loại `warn + mute + kick + ban` (không tính unmute/unban/note).

### Mute
- Role `Muted` **không tự chặn được ai** (role không có quyền "trừ") — bot chặn bằng overwrite `SendMessages: false`... cho role đó trên từng kênh (`/setup` áp toàn bộ, kênh mới tự áp qua event `channelCreate`).
- Mute tạm thời: lưu `expires_at` trong DB, scheduler `setTimeout` (chunk 24.8 ngày cho case dài) — bot restart vẫn khôi phục.
- Thành viên bị mute mà rời server rồi join lại: bot tự gán lại role nếu case còn hiệu lực.

### Audit log
- Hành động của bot → log case đầy đủ (ai làm, lý do, thời hạn).
- Hành động làm trực tiếp qua Discord UI (ban/kick/unban/timeout/gán-gỡ role Muted) → bắt qua `guildAuditLogEntryCreate`, log kèm người thực hiện, gắn nhãn "thao tác ngoài bot". Bot tự bỏ qua entry do chính nó tạo (tránh log trùng).

## Cấu trúc

```
src/
├── index.js              # khởi động bot, nạp commands/events
├── deploy-commands.js    # đăng ký slash command (npm run deploy)
├── config.js             # đọc .env
├── constants.js          # màu, metadata case type, giới hạn thời hạn
├── db.js                 # SQLite schema + toàn bộ query
├── commands/             # 12 slash command
├── events/               # ready, interactionCreate, guildMemberAdd,
│                         # guildAuditLogEntryCreate, channelCreate
├── services/
│   ├── mutes.js          # role Muted, overwrite kênh, gán/gỡ mute
│   ├── scheduler.js      # hẹn giờ temp mute / temp ban
│   └── log.js            # gửi mod log
└── utils/                # duration, embeds, permissions, paginate, loaders
data/bot.sqlite           # database (tự tạo, đã gitignore)
```

## Ghi chú vận hành

- **Đổi tên role Muted?** Đổi `MUTE_ROLE_NAME` trong `.env` hoặc dùng `/config set-mute-role` + `/setup`.
- **Role Muted bị xóa?** Bot tự tạo lại ở lần mute kế tiếp (chạy lại `/setup` để đồng bộ overwrite các kênh).
- **Bot không gửi được log?** Kiểm tra bot có `Send Messages` + `Embed Links` trong kênh log và role bot nằm trên role Muted.
- **Backup:** chỉ cần copy `data/bot.sqlite` (và file `-wal` nếu đang chạy).

## Roadmap (gợi ý mở rộng)

- [ ] Prefix commands (`?warn`, `?mute`...) cho thao tác nhanh
- [ ] Message log (edit/delete + snipe)
- [ ] Appeal / xin gỡ mute, DM thông báo cho người bị xử lý
- [ ] Web dashboard
