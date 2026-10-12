const Vendor = require("../models/Vendor");
const Product = require("../models/Product");
const Order = require("../models/Order");

// =====================================
// CREATE PRODUCT
// =====================================
exports.createProduct = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "merchant",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Merchant profile not found",
      });
    }

    if (vendor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Merchant is not approved",
      });
    }

    const {
      name,
      description,
      image,
      price,
      stock,
      category,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Product name and price are required",
      });
    }

    if (Number(price) < 0) {
      return res.status(400).json({
        success: false,
        message: "Price cannot be negative",
      });
    }

    if (Number(stock || 0) < 0) {
      return res.status(400).json({
        success: false,
        message: "Stock cannot be negative",
      });
    }

    const product = await Product.create({
      vendor: vendor._id,
      name: String(name).trim(),
      description: description || "",
      image: image || "",
      price: Number(price),
      stock: Number(stock || 0),
      category: category || "",
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Create Product Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create product",
    });
  }
};

// =====================================
// GET MY PRODUCTS
// =====================================
exports.getProducts = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "merchant",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Merchant profile not found",
      });
    }

    const products = await Product.find({
      vendor: vendor._id,
    }).sort({
      createdAt: -1,
    });

    return res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Get Products Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};

// =====================================
// UPDATE PRODUCT
// =====================================
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "merchant",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Merchant profile not found",
      });
    }

    const product = await Product.findOne({
      _id: id,
      vendor: vendor._id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const allowedFields = [
      "name",
      "description",
      "image",
      "price",
      "stock",
      "category",
      "isActive",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    if (product.price < 0 || product.stock < 0) {
      return res.status(400).json({
        success: false,
        message: "Price and stock cannot be negative",
      });
    }

    await product.save();

    return res.json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Update Product Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update product",
    });
  }
};

// =====================================
// DELETE PRODUCT
// =====================================
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "merchant",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Merchant profile not found",
      });
    }

    const product = await Product.findOne({
      _id: id,
      vendor: vendor._id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    product.isActive = false;

    await product.save();

    return res.json({
      success: true,
      message: "Product deactivated successfully",
      product,
    });
  } catch (error) {
    console.error("Delete Product Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
};

// =====================================
// GET MERCHANT ORDERS
// =====================================
exports.getOrders = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "merchant",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Merchant profile not found",
      });
    }

    const orders = await Order.find({
      vendor: vendor._id,
    })
      .populate("customer", "phone role status")
      .populate("items.product", "name image price")
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get Merchant Orders Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch merchant orders",
    });
  }
};

// =====================================
// UPDATE ORDER STATUS
// =====================================
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }

    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "merchant",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Merchant profile not found",
      });
    }

    const order = await Order.findOne({
      _id: id,
      vendor: vendor._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status === "delivered") {
      return res.status(400).json({
        success: false,
        message: "Delivered order cannot be updated",
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled order cannot be updated",
      });
    }

    order.status = status;

    if (status === "delivered") {
      order.paymentStatus =
        order.remainingAmount > 0
          ? "partial"
          : "paid";
    }

    await order.save();

    return res.json({
      success: true,
      message: "Order status updated successfully",
      order,
    });
  } catch (error) {
    console.error("Update Order Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });
  }
};

// =====================================
// UPDATE ORDER ADVANCE
// =====================================
exports.updateOrderAdvance = async (req, res) => {
  try {
    const {
      orderId,
      advanceAmount,
    } = req.body;

    if (!orderId || advanceAmount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Order ID and advance amount are required",
      });
    }

    const advance = Number(advanceAmount);

    if (!Number.isFinite(advance) || advance < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid advance amount",
      });
    }

    const vendor = await Vendor.findOne({
      user: req.user.id,
      role: "merchant",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Merchant profile not found",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      vendor: vendor._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (advance > order.totalAmount) {
      return res.status(400).json({
        success: false,
        message: "Advance cannot exceed total order amount",
      });
    }

    order.advanceAmount = advance;
    order.remainingAmount =
      order.totalAmount - advance;

    if (order.remainingAmount === 0) {
      order.paymentStatus = "paid";
    } else if (advance > 0) {
      order.paymentStatus = "partial";
    } else {
      order.paymentStatus = "pending";
    }

    await order.save();

    return res.json({
      success: true,
      message: "Order advance updated successfully",
      order,
    });
  } catch (error) {
    console.error("Update Order Advance Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update order advance",
    });
  }
};