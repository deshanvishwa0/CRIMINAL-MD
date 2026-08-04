const crypto = require("crypto");

async function sendDashboardPassword(socket, userJid, number, configsCol) {
    try {
        const password = crypto.randomBytes(6).toString("hex");

        await configsCol.updateOne(
            { number },
            {
                $set: {
                    dashboardPassword: password,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        const msg = `╭━━〔 🔐 DASHBOARD LOGIN 〕━━╮

👤 Number : ${number}
🔑 Password : ${password}

━━━━━━━━━━━━━━━━━━
⚠️ මේ Password එක කාටවත්
Share කරන්න එපා.

🌐 Dashboard එකට Login වෙන්න
මේ Password එක භාවිතා කරන්න.

© KEZU DASHBOARD
╰━━━━━━━━━━━━━━━━━━╯`;

        await socket.sendMessage(userJid, {
            text: msg
        });

        console.log(`✅ Dashboard password sent to ${number}`);

    } catch (err) {
        console.error("Dashboard Password Error:", err);
    }
}

async function verifyDashboardPassword(number, password, configsCol) {
    try {
        const data = await configsCol.findOne({ number });

        if (!data) return false;

        return data.dashboardPassword === password;

    } catch (err) {
        console.error(err);
        return false;
    }
}

module.exports = {
    sendDashboardPassword,
    verifyDashboardPassword
};
