const nodemailer = require('nodemailer');
const { SMTP } = require('../config/config');

// Create reusable transporter
const transporter = nodemailer.createTransport({
    host: SMTP.HOST,
    port: SMTP.PORT,
    secure: SMTP.PORT == 465, // true for 465, false for other ports
    auth: {
        user: SMTP.USER,
        pass: SMTP.PASS
    }
});

/**
 * Send an email to a member when they register
 * @param {Object} memberData - The member's details (name, email, memberId)
 */
exports.sendRegistrationEmail = async (memberData) => {
    try {
        if (!SMTP.USER || !SMTP.PASS) return;

        const { name, email, memberId, companyName } = memberData;

        // Email header template
        const mailOptions = {
            from: `"CAIP Support" <${SMTP.USER}>`,
            to: email,
            subject: 'Welcome to CAIP - Registration Successful',
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #2c3e50;">Hello, ${name}!</h2>
                    <p>Thank you for registering with <strong>CAIP (Chamber For Agri Input Protection)</strong>.</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Company:</strong> ${companyName || 'N/A'}</p>
                        <p style="margin: 0;"><strong>Membership ID:</strong> ${memberId}</p>
                        <p style="margin: 0;"><strong>Status:</strong> Pending Admin Approval</p>
                    </div>
                    <p>Our team is currently reviewing your application and business documents. You will receive another notification once your account has been approved.</p>
                    <p>If you have any questions, feel free to contact us.</p>
                    <br>
                    <p>Regards,<br><strong>Team CAIP</strong></p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Registration email sent to: ${email}`);
    } catch (error) {
        console.error('Error sending registration email:', error);
    }
};

/**
 * Notify admin about a new registration
 */
exports.notifyAdminOnRegistration = async (memberData) => {
    try {
        if (!SMTP.USER || !SMTP.PASS || !SMTP.ADMIN) return;

        const { name, email, memberId, companyName, phone } = memberData;

        const mailOptions = {
            from: `"CAIP System" <${SMTP.USER}>`,
            to: SMTP.ADMIN,
            subject: 'Action Required: New Member Registration',
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h3>New Membership Request</h3>
                    <p>A new member has registered and is awaiting verification.</p>
                    <ul>
                        <li><strong>Name:</strong> ${name}</li>
                        <li><strong>Company:</strong> ${companyName || 'N/A'}</li>
                        <li><strong>Email:</strong> ${email}</li>
                        <li><strong>Phone:</strong> ${phone}</li>
                        <li><strong>Member ID:</strong> ${memberId}</li>
                    </ul>
                    <p>Please login to the admin dashboard to review documents and approve/reject the application.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Admin alert email sent for: ${memberId}`);
    } catch (error) {
        console.error('Error sending admin notification:', error);
    }
};

/**
 * Send an email to the member when their account status changes
 */
exports.sendStatusUpdateEmail = async (memberData) => {
    try {
        if (!SMTP.USER || !SMTP.PASS) return;

        const { name, email, status, rejectionReason } = memberData;
        const isApproved = status == 1; // Use loose equality to handle both String ("1") and Number (1)

        const mailOptions = {
            from: `"CAIP Admin" <${SMTP.USER}>`,
            to: email,
            subject: isApproved ? 'Account Approved - CAIP' : 'Account Update - CAIP',
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: ${isApproved ? '#27ae60' : '#c0392b'};">Hello, ${name}!</h2>
                    
                    ${isApproved ? `
                        <p>We are pleased to inform you that your CAIP account has been <strong>APPROVED</strong>.</p>
                        <p>You can now log in to the portal and access all membership features.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="http://localhost:3000/login" style="background-color: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login to Portal</a>
                        </div>
                    ` : `
                        <p>Your application for a CAIP account has been <strong>REJECTED</strong> at this time.</p>
                        ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
                        <p>If you believe this was in error, please contact our support team to provide additional information.</p>
                    `}
                    
                    <p>Regards,<br><strong>Team CAIP</strong></p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Status update email (${isApproved ? 'Approved' : 'Rejected'}) sent to: ${email}`);
    } catch (error) {
        console.error('Error sending status update email:', error);
    }
};

/**
 * Send emails when a new defaulter is reported
 * Sends to: 1. Admin, 2. Defaulter (Request Mail), 3. Reporting Member (Confirmation)
 */
exports.sendDefaulterAdditionEmail = async (memberData, defaulterData) => {
    try {
        if (!SMTP.USER || !SMTP.PASS) return;

        const { name: memberName, email: memberEmail, companyName: memberCompany } = memberData;
        const {
            defaulter_name,
            email_id: defaulterEmail,
            default_amount,
            reason_description,
            gst_number,
            pan_number
        } = defaulterData;

        // 1. Send Alert to Admin
        if (SMTP.ADMIN) {
            await transporter.sendMail({
                from: `"CAIP Alerts" <${SMTP.USER}>`,
                to: SMTP.ADMIN,
                subject: `Alert: New Defaulter Added by ${memberCompany || memberName}`,
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333;">
                        <h3>New Defaulter Entry</h3>
                        <p><strong>Reported By:</strong> ${memberCompany || memberName} (${memberEmail})</p>
                        <hr>
                        <p><strong>Defaulter:</strong> ${defaulter_name}</p>
                        <p><strong>Amount:</strong> ₹${default_amount}</p>
                        <p><strong>GST/PAN:</strong> ${gst_number || 'N/A'} / ${pan_number || 'N/A'}</p>
                        <p>Review this in the admin panel.</p>
                    </div>
                `
            });
        }

        // 2. Send Listing Notification to Defaulter
        if (defaulterEmail) {
            await transporter.sendMail({
                from: `"CAIP" <${SMTP.USER}>`,
                to: defaulterEmail,
                subject: `Account Listed: CAIP Defaulter - ${memberCompany || memberName}`,
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                        <h2 style="color: #2c3e50;">Defaulter Listing Notification</h2>
                        <p>Hello <strong>${defaulter_name}</strong>,</p>
                        <p>This is to inform you that your profile has been listed as a <strong>Defaulter</strong> in the <strong>Chamber For Agri Input Protection (CAIP)</strong> system.</p>
                        
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 0;"><strong>Listed By:</strong> ${memberCompany || memberName}</p>
                            <p style="margin: 0;"><strong>Default Amount:</strong> ₹${default_amount}</p>
                            <p style="margin: 0;"><strong>Reason:</strong> ${reason_description || 'N/A'}</p>
                            <p style="margin: 0;"><strong>Listed Date:</strong> ${new Date().toLocaleDateString()}</p>
                        </div>

                        <p>This record is now part of the CAIP national network which is accessible to all verified members of the agricultural industry.</p>
                        <p>If you wish to resolve this or have this record removed, please contact <strong>${memberCompany || memberName}</strong> directly at ${memberEmail}.</p>
                        
                        <p style="font-size: 12px; color: #777; margin-top: 30px;">This is an automated system notification from the CAIP.</p>
                        <p>Regards,<br><strong>Team CAIP</strong></p>
                    </div>
                `
            });
        }

        // 3. Send Confirmation to reporting Member
        if (memberEmail) {
            await transporter.sendMail({
                from: `"CAIP System" <${SMTP.USER}>`,
                to: memberEmail,
                subject: `Defaulter Reported: ${defaulter_name} - CAIP`,
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                        <h2 style="color: #2c3e50;">Defaulter Report Confirmation</h2>
                        <p>Hello ${memberName},</p>
                        <p>Your report for <strong>${defaulter_name}</strong> has been successfully added to the CAIP database.</p>
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 0;"><strong>Defaulter Name:</strong> ${defaulter_name}</p>
                            <p style="margin: 0;"><strong>Default Amount:</strong> ₹${default_amount}</p>
                            <p style="margin: 0;"><strong>Notification Sent:</strong> A request mail has been sent to ${defaulterEmail || 'N/A'}</p>
                        </div>
                        <p>Thank you for contributing to the industry's safety network.</p>
                        <p>Regards,<br><strong>Team CAIP</strong></p>
                    </div>
                `
            });
        }

        console.log(`Defaulter addition emails (Admin, Defaulter, Member) sent for: ${defaulter_name}`);
    } catch (error) {
        console.error('Error sending defaulter addition emails:', error);
    }
};
