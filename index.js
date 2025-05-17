const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

const leads = new Map(); // Temporary store — use a DB in production

// Store lead data
app.post('/api/store-lead', (req, res) => {
  const { name, email, phone, business } = req.body;
  if (!email || !name) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  leads.set(email, { name, phone, business });
  console.log(`Stored lead: ${email}`);
  res.status(200).json({ success: true });
});

// Calendly webhook
app.post('/webhook/calendly', async (req, res) => {
  try {
    const event = req.body;
    console.log('Received Calendly webhook:', event);

    if (event.event === 'invitee.created') {
      const email = event.payload?.invitee?.email;
      const lead = leads.get(email);

      if (!lead) {
        console.warn(`No matching lead found for email: ${email}`);
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      const name = lead.name;
      const phone = lead.phone || '';
      const message = `Hi ${name}, thanks for booking your AI Agent demo! We'll see you soon.`;

      // Send email
      await sgMail.send({
        to: email,
        from: process.env.EMAIL_FROM,
        subject: 'AI Agent Demo Booking Confirmation',
        text: message,
      });


      // Send SMS
      if (phone) {
        await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE,
          to: phone,
        });

        await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_WHATSAPP,
          to: `whatsapp:${phone}`,
        });
      }

      leads.delete(email); // Clean up if desired
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
