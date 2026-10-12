const Job = require("../models/Job");
const Vendor = require("../models/Vendor");

// =====================================
// CREATE JOB
// =====================================
exports.createJob = async (req, res) => {
  try {
    const {
      vendorId,
      type,
      title,
      description,
      scheduledAt,
      amount,
      address,
      notes,
    } = req.body;

    if (!vendorId || !title) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID and title are required",
      });
    }

    const vendor = await Vendor.findOne({
      _id: vendorId,
      status: "approved",
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Approved vendor not found",
      });
    }

    const job = await Job.create({
      vendor: vendor._id,
      customer: req.user.id,
      type: type || "other",
      title: String(title).trim(),
      description: description || "",
      scheduledAt: scheduledAt || null,
      amount: Number(amount || 0),
      address: address || "",
      notes: notes || "",
      status: "pending",
    });

    const populatedJob = await Job.findById(job._id)
      .populate("vendor", "name role phone city state")
      .populate("customer", "phone role");

    return res.status(201).json({
      success: true,
      message: "Job created successfully",
      job: populatedJob,
    });
  } catch (error) {
    console.error("Create Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create job",
    });
  }
};

// =====================================
// GET VENDOR JOBS
// =====================================
exports.getVendorJobs = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      user: req.user.id,
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    const jobs = await Job.find({
      vendor: vendor._id,
    })
      .populate("customer", "phone role")
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    console.error("Get Vendor Jobs Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch jobs",
    });
  }
};

// =====================================
// GET CUSTOMER JOBS
// =====================================
exports.getCustomerJobs = async (req, res) => {
  try {
    const jobs = await Job.find({
      customer: req.user.id,
    })
      .populate("vendor", "name role phone city state")
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    console.error("Get Customer Jobs Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch jobs",
    });
  }
};

// =====================================
// GET SINGLE JOB
// =====================================
exports.getJob = async (req, res) => {
  try {
    const { id } = req.params;

    const job = await Job.findById(id)
      .populate("vendor", "name role phone city state")
      .populate("customer", "phone role");

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    const isVendor =
      job.vendor &&
      String(job.vendor._id) === String(req.user.vendorId);

    const isCustomer =
      String(job.customer._id) === String(req.user.id);

    // Fallback vendor ownership check
    if (!isCustomer) {
      const vendor = await Vendor.findOne({
        user: req.user.id,
      });

      if (!vendor || String(vendor._id) !== String(job.vendor._id)) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to view this job",
        });
      }
    }

    return res.json({
      success: true,
      job,
    });
  } catch (error) {
    console.error("Get Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch job",
    });
  }
};

// =====================================
// ACCEPT JOB
// =====================================
exports.acceptJob = async (req, res) => {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
      });
    }

    const vendor = await Vendor.findOne({
      user: req.user.id,
      status: "approved",
    });

    if (!vendor) {
      return res.status(403).json({
        success: false,
        message: "Approved vendor profile not found",
      });
    }

    const job = await Job.findOne({
      _id: jobId,
      vendor: vendor._id,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (job.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Job cannot be accepted because it is ${job.status}`,
      });
    }

    job.status = "accepted";

    await job.save();

    return res.json({
      success: true,
      message: "Job accepted successfully",
      job,
    });
  } catch (error) {
    console.error("Accept Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to accept job",
    });
  }
};

// =====================================
// DECLINE JOB
// =====================================
exports.declineJob = async (req, res) => {
  try {
    const {
      jobId,
      reason,
    } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
      });
    }

    const vendor = await Vendor.findOne({
      user: req.user.id,
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    const job = await Job.findOne({
      _id: jobId,
      vendor: vendor._id,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (job.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Job cannot be declined because it is ${job.status}`,
      });
    }

    job.status = "declined";
    job.declineReason = reason || "";

    await job.save();

    return res.json({
      success: true,
      message: "Job declined successfully",
      job,
    });
  } catch (error) {
    console.error("Decline Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to decline job",
    });
  }
};

// =====================================
// START JOB
// =====================================
exports.startJob = async (req, res) => {
  try {
    const { jobId } = req.body;

    const vendor = await Vendor.findOne({
      user: req.user.id,
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    const job = await Job.findOne({
      _id: jobId,
      vendor: vendor._id,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (job.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: "Only accepted jobs can be started",
      });
    }

    job.status = "in_progress";

    await job.save();

    return res.json({
      success: true,
      message: "Job started successfully",
      job,
    });
  } catch (error) {
    console.error("Start Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to start job",
    });
  }
};

// =====================================
// COMPLETE JOB
// =====================================
exports.completeJob = async (req, res) => {
  try {
    const { jobId } = req.body;

    const vendor = await Vendor.findOne({
      user: req.user.id,
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor profile not found",
      });
    }

    const job = await Job.findOne({
      _id: jobId,
      vendor: vendor._id,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (job.status !== "in_progress") {
      return res.status(400).json({
        success: false,
        message: "Only in-progress jobs can be completed",
      });
    }

    job.status = "completed";
    job.completedAt = new Date();

    await job.save();

    return res.json({
      success: true,
      message: "Job completed successfully",
      job,
    });
  } catch (error) {
    console.error("Complete Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to complete job",
    });
  }
};

// =====================================
// CANCEL JOB
// =====================================
exports.cancelJob = async (req, res) => {
  try {
    const { jobId } = req.body;

    const job = await Job.findOne({
      _id: jobId,
      customer: req.user.id,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (
      ["completed", "cancelled", "declined"].includes(
        job.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: `Job cannot be cancelled because it is ${job.status}`,
      });
    }

    job.status = "cancelled";

    await job.save();

    return res.json({
      success: true,
      message: "Job cancelled successfully",
      job,
    });
  } catch (error) {
    console.error("Cancel Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel job",
    });
  }
};