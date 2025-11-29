# Gemini Code Assistant Context

This document provides context for the Gemini Code Assistant to understand the project and provide better assistance.

## Project Overview

This is a Cloudflare Worker application written in TypeScript that monitors the uptime of different services. It exposes a `/ping` endpoint for services to report their status and a `/list` endpoint to view the status of all monitored services. It uses Cloudflare D1 for storage and Telegram for sending notifications.

## How it works

- Services send a POST request to the `/ping` endpoint, which records a timestamp in the D1 database.
- A scheduled task (`scheduled` function) runs periodically to check for services that haven't pinged within a configured interval.
- If a service is down, it sends a notification via Telegram and updates the service's status in the database.
- The `/list` endpoint displays the status of all monitored services in either HTML or JSON format.

## Building and Running

- To install dependencies: `npm install`
- To start a development server: `npm run start`
- To deploy the worker: `npm run deploy`

## Development Conventions

The project uses TypeScript and follows standard TypeScript conventions. The code is well-structured and easy to follow.

## Key Files

- `src/index.ts`: The main entry point of the Cloudflare Worker. It contains the `fetch` and `scheduled` handlers.
- `package.json`: Defines the project's dependencies and scripts.
- `wrangler.toml`: The configuration file for the Cloudflare Worker. Although this file is in `.gitignore`, it's crucial for the project's configuration. It should contain the following:
  - `name`: The name of the worker.
  - `main`: The entry point of the worker (e.g., `src/index.ts`).
  - `compatibility_date`: The compatibility date for the worker.
  - `d1_databases`: The D1 database bindings.
  - `vars`: Environment variables such as `CHAT_ID`, `TELEGRAM_TOKEN`, `INTERVAL`, and `ALARM_TIMEOUT`.
- `schema.sql`: The schema for the D1 database.

## Database Schema

The database schema is defined in `schema.sql`. It contains a single table, `hosts`, with the following columns:

- `name`: The name of the service being monitored.
- `pinged`: The timestamp of the last successful ping.
- `alarmed`: The timestamp of the last alarm notification.
