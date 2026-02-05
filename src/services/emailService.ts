import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export const createEmailTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
};

// Send lead notification email to admin
export const sendLeadNotificationEmail = async (leadData: {
  name: string;
  email: string;
  contact: string;
  city: string;
  profile: string;
}) => {
  const transporter = createEmailTransporter();

  const profileDisplay = leadData.profile.replace(/_/g, " ");

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER, // Admin email to receive notifications
    subject: `New Lead Submission - ${leadData.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">New Lead from Landing Page</h2>
        
        <div style="margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 12px; font-weight: bold; width: 30%;">Name:</td>
              <td style="padding: 12px;">${leadData.name}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold;">Email:</td>
              <td style="padding: 12px;"><a href="mailto:${leadData.email}" style="color: #2563eb;">${leadData.email}</a></td>
            </tr>
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 12px; font-weight: bold;">Contact:</td>
              <td style="padding: 12px;"><a href="tel:${leadData.contact}" style="color: #2563eb;">${leadData.contact}</a></td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold;">City:</td>
              <td style="padding: 12px;">${leadData.city}</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 12px; font-weight: bold;">Profile:</td>
              <td style="padding: 12px;">${profileDisplay}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold;">Submitted At:</td>
              <td style="padding: 12px;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <div style="margin-top: 20px; padding: 15px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <p style="margin: 0; color: #92400e;">
            <strong>Action Required:</strong> Please follow up with this lead as soon as possible.
          </p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Lead notification email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending lead notification email:", error);
    throw error;
  }
};

export const sendLeadConfirmationEmail = async (leadData: {
  name: string;
  email: string;
}) => {
  const transporter = createEmailTransporter();

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: leadData.email,
    subject: "Thank you for your interest!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2563eb;">Thank You, ${leadData.name}!</h2>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333;">
          Thank you for reaching out to us. We have received your request for a demo and our team will get in touch with you shortly.
        </p>

        <p style="font-size: 16px; line-height: 1.6; color: #333;">
          If you have any urgent questions, please don't hesitate to contact us directly.
        </p>

        <div style="margin-top: 30px; padding: 20px; background-color: #f9fafb; border-radius: 4px;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Best regards,<br>
            <strong>Your Team Name</strong>
          </p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Confirmation email sent to lead:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending confirmation email:", error);
    return { success: false, error };
  }
};

export const sendContactUsNotificationEmail = async (contactData: {
  name: string;
  email: string;
  companyName?: string;
  message: string;
}) => {
  const transporter = createEmailTransporter();

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `New Contact Us Message - ${contactData.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">New Contact Us Message</h2>
        
        <div style="margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 12px; font-weight: bold; width: 30%;">Name:</td>
              <td style="padding: 12px;">${contactData.name}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold;">Email:</td>
              <td style="padding: 12px;"><a href="mailto:${contactData.email}" style="color: #2563eb;">${contactData.email}</a></td>
            </tr>
            ${
              contactData.companyName
                ? `
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 12px; font-weight: bold;">Company:</td>
              <td style="padding: 12px;">${contactData.companyName}</td>
            </tr>
            `
                : ""
            }
            <tr>
              <td style="padding: 12px; font-weight: bold;">Message:</td>
              <td style="padding: 12px; white-space: pre-wrap; background-color: #f9f9f9; border-radius: 4px;">${contactData.message}</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
              <td style="padding: 12px; font-weight: bold;">Submitted At:</td>
              <td style="padding: 12px;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <div style="margin-top: 20px; padding: 15px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <p style="margin: 0; color: #92400e;">
            <strong>Action Required:</strong> Please respond to this contact us message as soon as possible.
          </p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Contact us notification email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending contact us notification email:", error);
    throw error;
  }
};

export const sendLoginHistoryEmail = async (
  recipientEmails: string[],
  loginHistory: any[],
  days: number,
) => {
  const transporter = createEmailTransporter();

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Login History");

  // Define columns with proper formatting
  worksheet.columns = [
    { header: "Login Time", key: "loginTime", width: 20 },
    { header: "User Name", key: "userName", width: 25 },
    { header: "Email", key: "userEmail", width: 30 },
    { header: "Organization", key: "organization", width: 30 },
    { header: "Status", key: "status", width: 12 },
    { header: "Login Method", key: "loginMethod", width: 15 },
    { header: "Provider", key: "provider", width: 15 },
    { header: "Failure Reason", key: "failureReason", width: 30 },
  ];

  // Style the header row
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2563EB" },
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "left" };

  // Add data rows
  loginHistory.forEach((record) => {
    const loginTime = new Date(record.loginTime).toLocaleString();
    const userName = record.user?.name || "Unknown";
    const userEmail = record.user?.email || "Unknown";
    const orgs =
      record.user?.organizationMembers
        ?.map((m: any) => m.organization?.name)
        .filter(Boolean)
        .join(", ") || "-";
    const status = record.success ? "Success" : "Failed";
    const method = record.loginMethod;
    const provider = record.provider || "-";
    const reason = record.failureReason || "-";

    const row = worksheet.addRow({
      loginTime,
      userName,
      userEmail,
      organization: orgs,
      status,
      loginMethod: method,
      provider,
      failureReason: reason,
    });

    // Color code status cells
    const statusCell = row.getCell("status");
    if (record.success) {
      statusCell.font = { color: { argb: "FF008000" }, bold: true };
    } else {
      statusCell.font = { color: { argb: "FFFF0000" }, bold: true };
    }

    // Add borders to all cells
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  // Auto-filter for the header row
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 8 },
  };

  // Generate temporary file path
  const tempDir = os.tmpdir();
  const fileName = `login_history_${Date.now()}.xlsx`;
  const filePath = path.join(tempDir, fileName);

  // Write workbook to file
  await workbook.xlsx.writeFile(filePath);

  // Email options with attachment
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: recipientEmails.join(", "),
    subject: `Login History Report - Last ${days} Day(s)`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Login History Report</h2>
        <p>Please find attached the login history report for the last ${days} day(s).</p>
        
        <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-radius: 4px;">
          <p style="margin: 5px 0;"><strong>Report Period:</strong> Last ${days} day(s)</p>
          <p style="margin: 5px 0;"><strong>Total Records:</strong> ${loginHistory.length}</p>
          <p style="margin: 5px 0;"><strong>Generated At:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <p style="color: #666; font-size: 14px;">
          The attached Excel file contains detailed login history with the following information:
        </p>
        <ul style="color: #666; font-size: 14px;">
          <li>Login Time</li>
          <li>User Information</li>
          <li>Organization Details</li>
          <li>Login Status and Method</li>
          <li>Provider Information</li>
          <li>Failure Reasons (if any)</li>
        </ul>
      </div>
    `,
    attachments: [
      {
        filename: fileName,
        path: filePath,
      },
    ],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Login history email sent:", info.messageId);

    // Clean up temporary file
    fs.unlinkSync(filePath);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending login history email:", error);
    // Clean up temporary file even on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
};
