const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Authentication - Kiểm tra JWT token
exports.authenticate = async (req, res, next) => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        message: "Không có token xác thực. Vui lòng đăng nhập." 
      });
    }

    const token = authHeader.substring(7); // Bỏ "Bearer "
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Tìm user
    const user = await User.findById(decoded.userId).select(
      "_id name email role isEmailVerified"
    );
    
    if (!user) {
      return res.status(401).json({ 
        message: "Token không hợp lệ. User không tồn tại." 
      });
    }

    // Gắn user vào request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ 
        message: "Token đã hết hạn. Vui lòng đăng nhập lại." 
      });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ 
        message: "Token không hợp lệ." 
      });
    }
    return res.status(500).json({ 
      message: "Lỗi xác thực: " + error.message 
    });
  }
};

exports.authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: "Chưa xác thực. Vui lòng đăng nhập." 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: "Bạn không có quyền thực hiện hành động này." 
      });
    }

    next();
  };
};

/**
 * Middleware để kiểm tra user chỉ có thể truy cập dữ liệu của chính mình
 * (trừ khi là ADMIN)
 */
exports.ensureOwnershipOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: "Chưa xác thực. Vui lòng đăng nhập."
    });
  }

  if (req.user.role === "ADMIN") {
    return next(); // Admin có thể truy cập tất cả
  }

  // Kiểm tra nếu user đang cố truy cập dữ liệu của user khác
  const requestedUserId = req.params.userId || req.params.id;
  
  if (requestedUserId && requestedUserId !== req.user._id.toString()) {
    return res.status(403).json({ 
      message: "Bạn không có quyền thực hiện hành động này." 
    });
  }

  next();
};

