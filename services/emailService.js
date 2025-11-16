const nodemailer = require('nodemailer');
const pool = require('../config/database');

// Configure email transporter (using Gmail as example)
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

class EmailService {
    static async sendKPINotification() {
        try {
            // Get current period KPI data
            const kpiData = await pool.query(`
                SELECT k.kpi_name, k.target_value, k.actual_value, k.unit, p.period_date
                FROM kpi_data k
                JOIN periods p ON k.period_id = p.id
                WHERE p.period_date = (
                    SELECT MAX(period_date) FROM periods
                )
            `);

            const underperformingKPIs = kpiData.rows.filter(kpi => {
                const performance = kpi.target_value > 0 ? (kpi.actual_value / kpi.target_value) : 0;
                return performance < 0.8; // Below 80% target
            });

            if (underperformingKPIs.length > 0) {
                const htmlContent = this.generateKPIAlertHTML(underperformingKPIs);
                
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: 'management@hilinafoods.com', // Management email
                    subject: '🚨 Hilina Foods - KPI Alert Report',
                    html: htmlContent
                };

                await transporter.sendMail(mailOptions);
                console.log('KPI alert email sent successfully');
            }
        } catch (error) {
            console.error('Error sending KPI notification:', error);
        }
    }

    static generateKPIAlertHTML(underperformingKPIs) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #e74c3c;">🚨 KPI Alert - Hilina Foods</h2>
                <p>The following KPIs are underperforming and require attention:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <thead>
                        <tr style="background-color: #34495e; color: white;">
                            <th style="padding: 12px; text-align: left;">KPI</th>
                            <th style="padding: 12px; text-align: left;">Target</th>
                            <th style="padding: 12px; text-align: left;">Actual</th>
                            <th style="padding: 12px; text-align: left;">Performance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${underperformingKPIs.map(kpi => {
                            const performance = (kpi.actual_value / kpi.target_value * 100).toFixed(1);
                            return `
                                <tr style="border-bottom: 1px solid #ddd;">
                                    <td style="padding: 12px;">${kpi.kpi_name}</td>
                                    <td style="padding: 12px;">${kpi.target_value}${kpi.unit}</td>
                                    <td style="padding: 12px;">${kpi.actual_value}${kpi.unit}</td>
                                    <td style="padding: 12px; color: #e74c3c; font-weight: bold;">${performance}%</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                
                <p>Please review these metrics in the <a href="http://your-dashboard-url.com">Executive Dashboard</a>.</p>
                
                <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                    <small>This is an automated alert from Hilina Foods Reporting System.</small>
                </div>
            </div>
        `;
    }

    static async sendMonthlyReport() {
        try {
            // Generate monthly report email
            const htmlContent = await this.generateMonthlyReportHTML();
            
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: 'board@hilinafoods.com', // Board email
                subject: '📊 Hilina Foods - Monthly Performance Report',
                html: htmlContent
            };

            await transporter.sendMail(mailOptions);
            console.log('Monthly report email sent successfully');
        } catch (error) {
            console.error('Error sending monthly report:', error);
        }
    }

    static async generateMonthlyReportHTML() {
        // Implementation for monthly report generation
        return `<h2>Monthly Performance Report</h2><p>Report content...</p>`;
    }
}

module.exports = EmailService;