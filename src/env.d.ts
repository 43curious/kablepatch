/// <reference types="astro/client" />
/// <reference types="node" />

import type { AuthSession } from './server/auth';

declare global {
  namespace App {
    interface Locals {
      session: AuthSession | null;
    }
  }
}

export {};
