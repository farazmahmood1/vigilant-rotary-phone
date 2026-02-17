require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// --- CORS ---
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
  })
);

// --- Stripe webhook needs raw body, so this route must come BEFORE express.json() ---
app.post(
  "/payment/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("--- Payment Successful ---");
      console.log("Customer:", session.customer_details?.name);
      console.log("Email:", session.customer_details?.email);
      console.log("Amount:", session.amount_total / 100, session.currency?.toUpperCase());
      console.log("Session ID:", session.id);
      console.log("Metadata:", session.metadata);
      // TODO: Add your own logic here (save to DB, send email, etc.)
    }

    res.json({ received: true });
  }
);

// --- JSON parser for all other routes ---
app.use(express.json());

// --- Health check ---
app.get("/", (req, res) => {
  res.json({ status: "Khidmaat backend is running" });
});

// --- Create Stripe Checkout Session ---
app.post("/payment/create-session", async (req, res) => {
  try {
    const { customer, service } = req.body;

    if (!customer?.name || !customer?.email) {
      return res.status(400).json({ success: false, error: "Customer name and email are required" });
    }

    const serviceName = service?.serviceType?.serviceName || "Service Request";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: customer.email,
      line_items: [
        {
          price_data: {
            currency: "aed",
            product_data: {
              name: `Khidmaat - ${serviceName}`,
              description: "Advance service fee (AED 10). Final price quoted after inspection.",
            },
            unit_amount: 1000, // AED 10.00 in fils
          },
          quantity: 1,
        },
      ],
      metadata: {
        customerName: customer.name,
        customerEmail: customer.email,
        serviceName: serviceName,
        deliveryOption: service?.deliveryOption || "",
        selectedCity: service?.selectedCity || "",
      },
      success_url: `${process.env.CLIENT_URL}/#/submit-success`,
      cancel_url: `${process.env.CLIENT_URL}/#/submit-cancel`,
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
