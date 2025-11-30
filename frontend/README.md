# Fuel Order Management System - Frontend

A modern React + TypeScript application for managing delivery orders, local purchase orders (LPOs), and fuel records.

## Features

- **Dashboard**: Overview of all operations with key metrics
- **Delivery Orders (DOs)**: Manage import/export transportation records
- **Local Purchase Orders (LPOs)**: Track fuel purchases and diesel supplies
- **Fuel Records**: Monitor fuel consumption across all trips
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Tech Stack

- **React 18**: UI library
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **React Router**: Client-side routing
- **Lucide React**: Icon library
- **Papa Parse**: CSV parsing for data import

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

The production build will be in the `dist` folder.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/        # Reusable UI components
│   │   └── Layout.tsx     # Main layout with navigation
│   ├── pages/             # Page components
│   │   ├── Dashboard.tsx
│   │   ├── DeliveryOrders.tsx
│   │   ├── LPOs.tsx
│   │   └── FuelRecords.tsx
│   ├── types/             # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/             # Utility functions
│   ├── services/          # API services
│   ├── App.tsx            # Root component
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles
├── public/                # Static assets
├── index.html             # HTML template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Development

- The app uses Vite's proxy to forward `/api` requests to `http://localhost:5000` (backend)
- Hot Module Replacement (HMR) is enabled for fast development
- TypeScript strict mode is enabled for type safety

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Next Steps

1. Implement API services for data fetching
2. Add CSV import functionality
3. Create forms for adding/editing records
4. Add authentication and authorization
5. Implement data export functionality
6. Add unit and integration tests
