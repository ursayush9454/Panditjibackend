const DeviceToken = require("../models/DeviceToken");

let firebaseAdmin = null;
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) return firebaseAdmin;
  firebaseInitialized = true;

  try {
    firebaseAdmin = require("firebase-admin");

    if (firebaseAdmin.apps.length === 0) {
      const serviceAccountPath =
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

      if (!serviceAccountPath) {
        firebaseAdmin = null;
        console.warn(
          "Firebase push disabled: FIREBASE_SERVICE_ACCOUNT_PATH is missing"
        );
        return null;
      }

      const serviceAccount = require(
        require("path").resolve(serviceAccountPath)
      );

      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
      });
    }

    return firebaseAdmin;
  } catch (error) {
    firebaseAdmin = null;
    console.error("Firebase initialization failed:", error.message);
    return null;
  }
};

exports.sendPushToUser = async ({
  userId,
  title,
  body,
  data = {},
}) => {
  const admin = initializeFirebase();

  if (!admin) {
    return {
      success: false,
      reason: "FCM_NOT_CONFIGURED",
    };
  }

  const devices = await DeviceToken.find({
    user: userId,
    isActive: true,
  });

  if (!devices.length) {
    return {
      success: false,
      reason: "NO_ACTIVE_DEVICE_TOKENS",
    };
  }

  const results = await Promise.all(
    devices.map(async (device) => {
      try {
        const response = await admin.messaging().send({
          token: device.token,
          notification: {
            title: String(title || "Vaidic Sanskar"),
            body: String(body || ""),
          },
          data: Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              key,
              String(value ?? ""),
            ])
          ),
        });

        device.lastUsedAt = new Date();
        await device.save();

        return {
          success: true,
          deviceId: String(device._id),
          messageId: response,
        };
      } catch (error) {
        const invalidTokenCodes = [
          "messaging/registration-token-not-registered",
          "messaging/invalid-registration-token",
        ];

        if (invalidTokenCodes.includes(error.code)) {
          device.isActive = false;
          await device.save();
        }

        console.error("FCM Send Error:", error.message);

        return {
          success: false,
          deviceId: String(device._id),
          reason: error.code || "FCM_SEND_FAILED",
        };
      }
    })
  );

  return {
    success: results.some((result) => result.success),
    results,
  };
};