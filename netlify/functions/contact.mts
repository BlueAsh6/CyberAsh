import type { Context, Config } from "@netlify/functions";

interface ContactFormData {
  name: string;
  email: string;
  service?: string;
  message: string;
  website?: string; // honeypot field
}

export default async (req: Request, context: Context) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data: ContactFormData = await req.json();

    // Honeypot check - if this field is filled, it's likely a bot
    if (data.website) {
      // Silently accept but don't process
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    if (!data.name || !data.email || !data.message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate field lengths
    if (data.name.length > 100) {
      return new Response(JSON.stringify({ error: "Name too long" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (data.message.length > 5000) {
      return new Response(JSON.stringify({ error: "Message too long" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get the notification email from environment variable
    const notificationEmail = Netlify.env.get("CONTACT_EMAIL") || "ash-advisory@proton.me";

    // Log the submission (useful for debugging and as a backup)
    console.log("=== New Contact Form Submission ===");
    console.log(`Name: ${data.name}`);
    console.log(`Email: ${data.email}`);
    console.log(`Service: ${data.service || "Not specified"}`);
    console.log(`Message: ${data.message}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log("===================================");

    // Option 1: If you have a Resend API key configured
    const resendApiKey = Netlify.env.get("RESEND_API_KEY");

    if (resendApiKey) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Contact Form <onboarding@resend.dev>",
          to: [notificationEmail],
          subject: `Nouveau message de ${data.name} - CyberAsh`,
          html: `
            <h2>Nouveau message de contact</h2>
            <p><strong>Nom:</strong> ${escapeHtml(data.name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
            <p><strong>Service souhaité:</strong> ${escapeHtml(data.service || "Non spécifié")}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtml(data.message).replace(/\n/g, "<br>")}</p>
            <hr>
            <p><small>Envoyé depuis le formulaire de contact CyberAsh le ${new Date().toLocaleString("fr-FR")}</small></p>
          `,
          reply_to: data.email,
        }),
      });

      if (!emailResponse.ok) {
        console.error("Failed to send email via Resend:", await emailResponse.text());
        // Continue anyway - the form data is logged
      }
    }

    // Success response
    return new Response(
      JSON.stringify({
        success: true,
        message: "Message received successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing contact form:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

// Helper function to escape HTML
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

export const config: Config = {
  path: "/api/contact",
};
