# Plan: <!-- feature title -->

## Approach

<!-- The design in a few paragraphs. Decide here, not mid-code. Name the
     alternatives you rejected and why, in one line each. -->

## Interfaces and data

<!-- New or changed functions, endpoints, schemas, config, env vars. Signatures, not prose. -->

## Files

<!-- Files to add or change, one line each with the reason. -->

## Test strategy

<!-- Every AC maps to a test or a named manual step, at the lowest level that
     proves it. Levels: unit, integration, contract, component, e2e, manual.
     These are written first and locked. During build, each task adds its own
     unit tests red-green-refactor. -->

| AC | Test (file :: name) or manual step | Level |
| :- | :- | :- |
| AC-1 | <!-- tests/feature.test.ts :: "does X" --> | unit |

## Validation

<!-- Checks beyond the AC tests. Keep one line per check that fits a surface
     this feature touches, with its command, test or manual step. Delete the
     rest. Use the tools the repo already has. -->

- **Backend**: <!-- bad, missing and oversized input is rejected at the edge;
  auth holds on every new route; responses match the documented schema
  (contract test); an integration test runs against a real database, not a
  mock; the migration runs up and down on realistic data; outbound calls
  have a timeout; a retry or double submit does no harm -->
- **Frontend**: <!-- component tests find elements by role and label; one
  e2e test drives the main flow in a real browser; empty, loading and error
  states render; the flow works by keyboard and passes an automated
  accessibility scan; it holds at a narrow and a wide viewport; the browser
  console stays free of errors -->
- **Both**: <!-- lint, typecheck and build stay clean, with no new warnings -->


## Risks and rollback

- <!-- what can break, how we notice, how we undo it -->

## Deploy

- **Preview**: <!-- command or "PR preview from the host" -->
- **Production**: <!-- command; always run by or approved by a person -->
- **Smoke check**: <!-- URL or command that proves the deploy works -->
