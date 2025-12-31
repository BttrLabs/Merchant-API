# Merchant API

Built by [@jannisarndt](https://github.com/jannisarndt)

A modern e-commerce backend API built with Hono, Cloudflare Workers, and Stripe. This project started as a learning exercise to understand how platforms like Shopify structure their merchant infrastructure, and grew into a fully functional API that handles the complete e-commerce flow.

## What This Project Is About

As a junior developer curious about how large-scale e-commerce platforms work under the hood, I decided to build my own merchant API from scratch. The goal was to understand the core concepts: product catalogs, inventory management, cart sessions, checkout flows, and payment processing.

This isn't meant to compete with Shopify or similar platforms. It's a learning project that implements real-world patterns and might be useful for small projects, prototypes, or as a reference for others exploring similar concepts.

## Features

- **Product Management** - Create, update, and organize products with variants and images
- **Inventory Tracking** - Stock management with reservation system to prevent overselling
- **Cart System** - Session-based shopping carts with expiration handling
- **Stripe Checkout** - Full integration with Stripe for secure payment processing
- **Webhook Handling** - Automated order fulfillment via Stripe webhooks
- **GDPR Compliance** - PII encryption at rest for customer data
- **Admin Authentication** - API key-based access control for sensitive operations
- **OpenAPI Documentation** - Auto-generated API docs with Scalar UI

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono with Zod OpenAPI
- **Database**: PostgreSQL with Drizzle ORM
- **Payments**: Stripe Checkout
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (Neon, Supabase, or any provider)
- Stripe account with API keys
- Cloudflare account (for deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/bttrlabs/merchant.git
cd merchant

# Install dependencies
npm install

# Set up environment variables
cp .dev.vars.example .dev.vars
```

### Environment Variables

Create a `.dev.vars` file with the following:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
SERVICE_NAME=BTTR Merchant
SERVICE_VERSION=1.0.0
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ADMIN_API_KEY=your-secure-api-key
ENCRYPTION_KEY=your-32-byte-encryption-key
```

### Database Setup

```bash
# Generate migrations
pnpm run db:generate

# Apply migrations
pnpm run db:migrate
```

### Development

```bash
# Start local development server
pnpm run dev
```

The API will be available at `http://localhost:8787`. OpenAPI documentation is served at `/`.

### Deployment

```bash
# Deploy to Cloudflare Workers
pnpm run deploy
```

## API Overview

All endpoints are versioned under `/v1/`. Here's a quick overview:

| Resource | Description |
|----------|-------------|
| `GET /v1/products` | List all products |
| `POST /v1/products` | Create a product (admin) |
| `GET /v1/products/{slug}` | Get product details |
| `POST /v1/cart` | Create a shopping cart |
| `POST /v1/cart/items` | Add item to cart |
| `POST /v1/cart/checkout` | Start Stripe checkout |
| `GET /v1/inventory` | List inventory levels |
| `GET /v1/orders` | List orders (admin) |
| `GET /v1/health` | Health check |

For complete API documentation, visit `/docs` when running the server.

## How It Works

### Checkout Flow

1. Customer creates a cart and adds items
2. Cart items are validated against available inventory
3. On checkout, stock is reserved for 30 minutes
4. Customer is redirected to Stripe Checkout
5. Stripe webhook confirms payment
6. Reservations are converted to permanent stock deductions
7. Order status is updated to "paid"

### Inventory Reservations

To prevent overselling during checkout, the API implements a reservation system:

- Stock is temporarily reserved when checkout begins
- Reservations expire after 30 minutes if payment isn't completed
- Expired reservations automatically restore inventory
- This ensures accurate stock counts even with concurrent checkouts

### Data Security
 
Customer PII (email, name, address) is encrypted using AES-256-GCM before storage. Data is decrypted only when accessed through authenticated admin endpoints.

## Project Structure

```
src/
├── db/
│   ├── client.ts       # Database connection
│   ├── schemas.ts      # Zod schemas for validation
│   └── tables.ts       # Drizzle table definitions
├── lib/
│   ├── create-app.ts   # Hono app factory
│   ├── crypto.ts       # PII encryption utilities
│   └── inventory.ts    # Stock reservation logic
├── middleware/
│   ├── admin-auth.ts   # API key authentication
│   └── logger.ts       # Request logging
├── routes/
│   ├── products/       # Product CRUD
│   ├── variants/       # Variant management
│   ├── images/         # Product images
│   ├── cart/           # Cart operations
│   ├── inventory/      # Stock management
│   ├── reservations/   # Stock reservations
│   ├── orders/         # Order management
│   ├── webhooks/       # Stripe webhooks
│   └── health.ts       # Health check
└── index.ts            # App entry point
```

## Contributing

Contributions are welcome! This is a learning project, so I'm open to suggestions, improvements, and fixes.

### How to Contribute

1. Fork the repository
2. Clone your fork locally
3. Create a feature branch (`git checkout -b feature/your-feature`)
4. Make your changes
5. Commit your changes (`git commit -m "Add your feature"`)
6. Push to your fork (`git push origin feature/your-feature`)
7. Open a Pull Request

Whether it's fixing a typo, improving documentation, or adding new features, all contributions are appreciated.

## What I Learned

Building this project taught me a lot about:

- Designing RESTful APIs with proper resource modeling
- Handling concurrent operations (inventory reservations)
- Payment integration patterns and webhook security
- Data encryption for compliance requirements
- Edge computing with Cloudflare Workers
- Database design with relations and constraints

## License

MIT

---

If you found this helpful or have questions, feel free to open an issue. I'm always happy to discuss the implementation or help others learning similar concepts.
