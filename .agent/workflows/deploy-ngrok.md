---
description: Cách chạy game công khai qua ngrok để chơi cùng bạn bè
---

Để người khác có thể truy cập vào game đang chạy trên máy của bạn, bạn cần sử dụng một công cụ tạo tunnel như **ngrok**.

### Bước 1: Cài đặt ngrok
Nếu bạn chưa có ngrok, hãy tải và cài đặt:
- **macOS (Homebrew)**: `brew install ngrok/ngrok/ngrok`
- **Tải trực tiếp**: Truy cập [ngrok.com](https://ngrok.com/download) để tải file thực thi.

### Bước 2: Đăng ký và Cấu hình (Chỉ làm 1 lần)
1. Đăng ký tài khoản miễn phí tại [ngrok.com](https://dashboard.ngrok.com/signup).
2. Lấy **Authtoken** từ dashboard.
3. Chạy lệnh:
   ```bash
   ngrok config add-authtoken <YOUR_AUTHTOKEN>
   ```

### Bước 3: Chạy Game và Mở Tunnel

1. **Chạy server game của bạn**:
   // turbo
   ```bash
   node server/index.js
   ```

2. **Mở một terminal mới và chạy ngrok**:
   ```bash
   ngrok http 3000
   ```
   *(Thay 3000 bằng cổng bạn đang chạy nếu khác)*

### Bước 4: Chia sẻ Link
1. ngrok sẽ hiển thị một dòng `Forwarding` có dạng `https://xxxx-xxxx.ngrok-free.app`.
2. Truy cập vào link này trên trình duyệt.
3. Sử dụng nút **"Sao chép Link"** trong game để gửi cho bạn bè. Link sẽ tự động mang theo URL của ngrok, giúp bạn bè vào đúng phòng của bạn.

> [!IMPORTANT]
> - ngrok bản miễn phí sẽ yêu cầu người dùng nhấn "Visit Site" ở lần đầu truy cập.
> - Đảm bảo server game vẫn đang chạy trong khi sử dụng ngrok.
