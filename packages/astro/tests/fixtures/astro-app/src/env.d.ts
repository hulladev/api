/// <reference types="astro/client" />

declare namespace App {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Astro locals require declaration merging.
  interface Locals {
    actor: string
  }
}
