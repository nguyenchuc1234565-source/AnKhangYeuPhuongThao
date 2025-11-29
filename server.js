const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CẤU HÌNH NÂNG CAO ====================

// Xử lý uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  console.log('🔄 Tiến hành khởi động lại server...');
  // Không nên exit ngay lập tức, cho phép server tiếp tục chạy
  // nhưng ghi log lỗi để debug
});

// Xử lý unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION tại:', promise, 'lý do:', reason);
});

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('🔄 Nhận tín hiệu tắt server...');
  console.log('✅ Đang đóng kết nối...');

  // Đóng server sau 5 giây
  setTimeout(() => {
    console.log('✅ Server đã tắt an toàn');
    process.exit(0);
  }, 5000);
}

// ==================== MIDDLEWARE ====================

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

// Middleware log requests
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ==================== CẤU HÌNH MULTER ====================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'anhkiniem');
    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('✅ Đã tạo thư mục upload:', uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Tạo tên file duy nhất với timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = file.originalname.replace(/\s+/g, '_');
    const safeFilename = uniqueSuffix + '-' + originalName;
    console.log('📁 Tạo tên file:', safeFilename);
    cb(null, safeFilename);
  }
});

// Lọc file
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm'];

  if (allowedImageTypes.includes(file.mimetype) || allowedVideoTypes.includes(file.mimetype)) {
    console.log('✅ File được chấp nhận:', file.originalname, '- Type:', file.mimetype);
    cb(null, true);
  } else {
    console.log('❌ File bị từ chối:', file.originalname, '- Type:', file.mimetype);
    cb(new Error('Chỉ chấp nhận file ảnh và video!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  },
  fileFilter: fileFilter
});

// ==================== ROUTES ====================

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// Route chính
app.get('/', (req, res) => {
  console.log('🏠 Truy cập trang chủ');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API lấy danh sách memories
app.get('/api/memories', (req, res) => {
  try {
    console.log('📚 Đang lấy danh sách memories...');
    const memoriesDir = path.join(__dirname, 'anhkiniem');

    // Kiểm tra thư mục tồn tại
    if (!fs.existsSync(memoriesDir)) {
      console.log('📁 Thư mục memories chưa tồn tại, trả về mảng rỗng');
      return res.json([]);
    }

    const files = fs.readdirSync(memoriesDir);
    console.log(`📚 Tìm thấy ${files.length} files`);

    const memories = files.map(filename => {
      const filePath = path.join(memoriesDir, filename);

      try {
        const stats = fs.statSync(filePath);
        const extension = path.extname(filename).toLowerCase().substring(1);

        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
        const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];

        let type = 'unknown';
        if (imageExtensions.includes(extension)) {
          type = 'image';
        } else if (videoExtensions.includes(extension)) {
          type = 'video';
        }

        return {
          filename: filename,
          type: type,
          title: `Kỷ niệm ${filename.split('-').slice(2).join('-').split('.')[0]}`,
          date: stats.birthtime.toLocaleDateString('vi-VN'),
          size: stats.size,
          created: stats.birthtime
        };
      } catch (error) {
        console.error(`❌ Lỗi khi đọc file ${filename}:`, error.message);
        return null;
      }
    }).filter(Boolean); // Lọc bỏ các file null

    // Sắp xếp theo thời gian tạo (mới nhất đầu tiên)
    memories.sort((a, b) => new Date(b.created) - new Date(a.created));

    console.log(`✅ Trả về ${memories.length} memories`);
    res.json(memories);
  } catch (error) {
    console.error('❌ Lỗi khi đọc thư mục memories:', error);
    res.status(500).json({ 
      success: false,
      error: 'Không thể đọc danh sách kỷ niệm' 
    });
  }
});

// API upload file
app.post('/upload', upload.single('memory'), (req, res) => {
  try {
    if (!req.file) {
      console.log('❌ Không có file được chọn');
      return res.status(400).json({ 
        success: false, 
        error: 'Không có file được chọn' 
      });
    }

    console.log('✅ File uploaded:', req.file.filename, '- Size:', (req.file.size / 1024 / 1024).toFixed(2) + 'MB');

    res.json({
      success: true,
      filename: req.file.filename,
      message: 'Tải lên thành công!',
      size: req.file.size
    });
  } catch (error) {
    console.error('❌ Lỗi khi upload:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API xóa file
app.delete('/delete/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    console.log('🗑️  Đang xóa file:', filename);

    const filePath = path.join(__dirname, 'anhkiniem', filename);

    // Kiểm tra file tồn tại
    if (!fs.existsSync(filePath)) {
      console.log('❌ File không tồn tại:', filename);
      return res.status(404).json({
        success: false,
        error: 'File không tồn tại'
      });
    }

    // Xóa file
    fs.unlinkSync(filePath);
    console.log('✅ File deleted:', filename);

    res.json({
      success: true,
      message: 'Đã xóa file thành công'
    });
  } catch (error) {
    console.error('❌ Lỗi khi xóa file:', error);
    res.status(500).json({
      success: false,
      error: 'Không thể xóa file'
    });
  }
});

// API thay thế cho compatibility
app.get('/api/files', (req, res) => {
  console.log('🔄 Chuyển hướng /api/files -> /api/memories');
  res.redirect('/api/memories');
});

app.delete('/api/delete/:filename', (req, res) => {
  console.log('🔄 Chuyển hướng /api/delete -> /delete');
  res.redirect(`/delete/${req.params.filename}`);
});

// Phục vụ file tĩnh từ thư mục anhkiniem
app.use('/anhkiniem', express.static(path.join(__dirname, 'anhkiniem')));

// Route fallback - phục vụ index.html cho mọi route không khớp
app.get('*', (req, res) => {
  console.log('🔀 Fallback route cho:', req.url);
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== XỬ LÝ LỖI ====================

// Xử lý lỗi Multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('❌ Multer Error:', error.code);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File quá lớn. Kích thước tối đa là 20MB.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Trường không mong đợi'
      });
    }
  }

  console.error('❌ Server Error:', error.message);
  res.status(500).json({
    success: false,
    error: error.message
  });
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Không tìm thấy:', req.url);
  res.status(404).json({
    success: false,
    error: 'Không tìm thấy trang'
  });
});

// ==================== KHỞI ĐỘNG SERVER ====================

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 ỨNG DỤNG KHOẢNH KHẮC TÌNH YÊU');
  console.log('='.repeat(50));
  console.log(`📍 Server đang chạy: http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📁 Thư mục upload: ${path.join(__dirname, 'anhkiniem')}`);
  console.log('⏰ Server time:', new Date().toLocaleString('vi-VN'));
  console.log('❤️  Dành cho An Khang & Phương Thảo ❤️');
  console.log('='.repeat(50) + '\n');

  // Kiểm tra và tạo thư mục nếu cần
  const uploadDir = path.join(__dirname, 'anhkiniem');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ Đã tạo thư mục upload');
  }
});

// Xử lý lỗi server
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} đang được sử dụng!`);
    console.log('🔄 Thử sử dụng port khác...');
    // Có thể implement logic để thử port khác ở đây
  } else {
    console.error('❌ Server error:', error);
  }
});

// Graceful shutdown cho server
process.on('SIGTERM', () => {
  console.log('🔄 Nhận SIGTERM, đang tắt server...');
  server.close(() => {
    console.log('✅ Server đã đóng');
  });
});

process.on('SIGINT', () => {
  console.log('🔄 Nhận SIGINT, đang tắt server...');
  server.close(() => {
    console.log('✅ Server đã đóng');
    process.exit(0);
  });
});

// Monitor memory usage
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const memoryMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
    external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
  };

  if (memoryMB.heapUsed > 500) { // Cảnh báo nếu sử dụng > 500MB
    console.warn(`⚠️  Memory usage cao: ${memoryMB.heapUsed}MB`);
  }
}, 60000); // Kiểm tra mỗi phút

module.exports = app;