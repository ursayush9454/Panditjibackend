const Vendor = require("../models/Vendor");
const Product = require("../models/Product");
const Order = require("../models/Order");

// =====================================
// CREATE ORDER
// =====================================
exports.createOrder = async (req, res) => {
  try {
    const {
      vendorId,
      items,
      shippingAddress,
    } = req.body;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID is required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one product is required",
      });
    }

    const vendor = await Vendor.findOne({
      _id: vendorId,
      role: "merchant",
      status: "approved",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Approved merchant not found",
      });
    }

    const productIds = items.map((item) => item.productId);

    const products = await Product.find({
      _id: { $in: productIds },
      vendor: vendor._id,
      isActive: true,
    });

    if (products.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more products are invalid or unavailable",
      });
    }

    const orderItems = [];

    let subtotal = 0;

    for (const item of items) {
      const product = products.find(
        (p) => p._id.toString() === String(item.productId)
      );

      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `Invalid quantity for ${product.name}`,
        });
      }

      if (quantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`,
        });
      }

      const itemTotal = product.price * quantity;

      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.image,
        quantity,
        price: product.price,
      });
    }

    const totalAmount = subtotal;

    const order = await Order.create({
      customer: req.user.id,
      vendor: vendor._id,
      items: orderItems,
      subtotal,
      totalAmount,
      advanceAmount: 0,
      remainingAmount: totalAmount,
      status: "pending",
      paymentStatus: "pending",
      shippingAddress: {
        name: shippingAddress?.name || "",
        phone: shippingAddress?.phone || "",
        address: shippingAddress?.address || "",
        city: shippingAddress?.city || "",
        state: shippingAddress?.state || "",
        pincode: shippingAddress?.pincode || "",
      },
    });

    // Reduce stock
    for (const item of items) {
      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: {
            stock: -Number(item.quantity),
          },
        }
      );
    }

    const populatedOrder = await Order.findById(order._id)
      .populate("vendor", "name role city state")
      .populate("items.product");

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: populatedOrder,
    });
  } catch (error) {
    console.error("Create Order Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
};

// =====================================
// GET MY ORDERS
// =====================================
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user.id,
    })
      .populate("vendor", "name role city state")
      .populate("items.product")
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get My Orders Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
};

// =====================================
// GET SINGLE MY ORDER
// =====================================
exports.getMyOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      _id: id,
      customer: req.user.id,
    })
      .populate("vendor", "name role city state")
      .populate("items.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Get My Order Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch order",
    });
  }
};

// =====================================
// CANCEL MY ORDER
// =====================================
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({
      _id: id,
      customer: req.user.id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (
      ["shipped", "delivered", "cancelled"].includes(
        order.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because it is ${order.status}`,
      });
    }

    order.status = "cancelled";

    if (reason) {
      order.cancelReason = String(reason).trim();
    }

    await order.save();

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        {
          $inc: {
            stock: item.quantity,
          },
        }
      );
    }

    return res.json({
      success: true,
      message: "Order cancelled successfully",
      order,
    });
  } catch (error) {
    console.error("Cancel Order Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel order",
    });
  }
};