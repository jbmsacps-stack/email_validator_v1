const dns = require("dns").promises;
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();
const PORT = 5000;

// Upload folder path
const uploadsDir = path.join(__dirname, "uploads");

// Create uploads folder automatically if it does not exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

// Multer file filter: allow only CSV files
const fileFilter = function (req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext !== ".csv") {
    return cb(new Error("Only .csv files are allowed."));
  }

  cb(null, true);
};

// Multer upload setup with 5MB limit
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// Serve frontend files from project root
app.use(express.static(__dirname));

// Parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Validates a single email using the required 12 formatting rules.
 * Returns an object containing validity status and reason.
 */
function validateEmail(email) {
  const trimmedEmail = email.trim();

  // Rule 1: Not empty after trim
  if (trimmedEmail.length === 0) {
    return {
      isValid: false,
      reason: "Email is empty."
    };
  }

  // Rule 2: No spaces anywhere
  if (/\s/.test(trimmedEmail)) {
    return {
      isValid: false,
      reason: "Email contains spaces."
    };
  }

  // Rule 3: Exactly one @ symbol
  const atMatches = trimmedEmail.match(/@/g);
  if (!atMatches || atMatches.length !== 1) {
    return {
      isValid: false,
      reason: "Email must contain exactly one @ symbol."
    };
  }

  const [localPart, domainPart] = trimmedEmail.split("@");

  // Rule 4: Local part before @ is not empty
  if (!localPart) {
    return {
      isValid: false,
      reason: "Local part before @ is empty."
    };
  }

  // Rule 5: Domain after @ is not empty
  if (!domainPart) {
    return {
      isValid: false,
      reason: "Domain after @ is empty."
    };
  }

  // Rule 6: Domain contains at least one dot
  if (!domainPart.includes(".")) {
    return {
      isValid: false,
      reason: "Domain must contain at least one dot."
    };
  }

  const domainSections = domainPart.split(".");

  // Rule 7: Nothing before first dot in domain is empty
  if (domainSections[0].length === 0) {
    return {
      isValid: false,
      reason: "Domain name before first dot is empty."
    };
  }

  const tld = domainSections[domainSections.length - 1];

  // Rule 8: TLD after last dot is 2-6 letters only
  if (!/^[a-zA-Z]{2,6}$/.test(tld)) {
    return {
      isValid: false,
      reason: "Top-level domain must be 2-6 letters only."
    };
  }

  // Rule 9: No consecutive dots
  if (trimmedEmail.includes("..")) {
    return {
      isValid: false,
      reason: "Email cannot contain consecutive dots."
    };
  }

  // Rule 10: Does not start or end with dot or @
  if (
    trimmedEmail.startsWith(".") ||
    trimmedEmail.startsWith("@") ||
    trimmedEmail.endsWith(".") ||
    trimmedEmail.endsWith("@")
  ) {
    return {
      isValid: false,
      reason: "Email cannot start or end with dot or @."
    };
  }

  // Rule 11: Local part only has valid characters
  if (!/^[a-zA-Z0-9._+-]+$/.test(localPart)) {
    return {
      isValid: false,
      reason: "Local part contains invalid characters."
    };
  }

  // Rule 12: Full length between 6 and 254 characters
  if (trimmedEmail.length < 6 || trimmedEmail.length > 254) {
    return {
      isValid: false,
      reason: "Email length must be between 6 and 254 characters."
    };
  }

  return {
    isValid: true,
    reason: "Valid email."
  };
}

async function hasMxRecords(domain) {
  try {
    const cleanDomain = domain.trim().toLowerCase();

    const records = await dns.resolveMx(cleanDomain);

    console.log("MX records for", cleanDomain, records);

    return Array.isArray(records) && records.length > 0;
  } catch (error) {
    console.error("MX lookup failed for domain:", domain);
    console.error("DNS error code:", error.code);
    console.error("DNS error message:", error.message);

    return false;
  }
}

/**
 * POST endpoint for uploading and validating a CSV email file.
 * Reads one email per line, separates valid and invalid emails, and returns JSON.
 */
app.post("/api/validate-emails", upload.single("csvFile"), async function (req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No CSV file was uploaded."
    });
  }

  const filePath = req.file.path;

  fs.readFile(filePath, "utf8", async function (readError, fileData) {
    // Delete uploaded file after reading attempt
    fs.unlink(filePath, function (unlinkError) {
      if (unlinkError) {
        console.error("Failed to delete uploaded file:", unlinkError.message);
      }
    });

    if (readError) {
      return res.status(500).json({
        success: false,
        message: "Failed to read uploaded CSV file."
      });
    }

    const lines = fileData
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line.length > 0;
      });

    const validEmails = [];
    const invalidEmails = [];

    for (const email of lines) {
      const result = validateEmail(email);

      // Step 1: Format validation
      if (!result.isValid) {
        invalidEmails.push({
          email: email,
          reason: result.reason,
          validationStage: "format"
        });

        continue;
      }

      // Step 2: MX validation
      const domain = email.split("@")[1].toLowerCase();
      const mxValid = await hasMxRecords(domain);

      if (!mxValid) {
        invalidEmails.push({
          email: email,
          reason: "Domain cannot receive mail.",
          validationStage: "mx"
        });

        continue;
      }

      validEmails.push(email.trim());
    }

    const cleanedCsv = validEmails.join("\n");

    return res.json({
      success: true,
      summary: {
        total: lines.length,
        valid: validEmails.length,
        invalid: invalidEmails.length
      },
      valid: validEmails,
      invalid: invalidEmails,
      cleanedCsv: cleanedCsv
    });
  });
});

/**
 * Global error handler for Multer and server validation errors.
 */
app.use(function (error, req, res, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File is too large. Maximum allowed size is 5MB."
      });
    }
  }

  return res.status(400).json({
    success: false,
    message: error.message || "Something went wrong while processing the file."
  });
});

/**
 * Starts the Express server.
 */
app.listen(PORT, function () {
  console.log(`Email Validator server running at http://localhost:${PORT}`);
});