# Goals Flow Validation

Date: 2026-06-20
Status: implemented as app behavior and demo data

## Current Flow Issue

The previous flow made goals feel secondary. A new manual profile started with no goals and landed in Capture, while Planning only listed existing goals. If there were no goals, Planning had no clear next action. The old metric also mixed progress, monthly plan, and capacity into one number, which made large goals hard to understand.

## Product Decision

Goals are now a first-class part of each profile:

- A manual profile can include a first optional goal at creation time.
- Capture starts with a goal form, so a user can add a goal without scrolling past accounts and transactions.
- Planning has a "Nueva meta" action and an empty state when the profile has no goals.
- Each goal separates progress, required monthly contribution, planned coverage, and capacity usage.

## Real Source Basis

- CFPB "Your Money, Your Goals" describes financial empowerment materials used to help people meet financial goals by increasing knowledge, skills, and resources: https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/
- FDIC Money Smart exposes planning tools including a budget worksheet, which supports using budget/cash-flow inputs as the basis for affordability checks: https://www.fdic.gov/resources/consumers/money-smart/organizing-reality-fairs/documents/guide-to-organizing-reality-fairs.pdf#budget-worksheet

These sources justify the app behavior as a planning and education aid, not as financial advice. The app calculates whether the user's stated plan fits recent savings capacity.

## Demo Goal

The `big_goal_planner` profile includes a fictitious documented goal:

- Name: Fondo emergencia 6 meses
- Type: emergency
- Target: MXN 182,700
- Current saved: MXN 95,000
- Target date: 2027-03-01
- Planned monthly contribution: MXN 11,000
- Source shown in UI: CFPB Your Money, Your Goals

Expected behavior:

- Remaining amount is MXN 87,700.
- With the fixed app date of 2026-06-20, there are about 9 months left.
- Required monthly amount is about MXN 9,744.
- Planned contribution covers more than 100% of that goal individually.
- In the "Metas grandes" profile, aggregate goal load should still warn because the home, vehicle, travel, and emergency goals compete for the same savings capacity.

## Validation Cases

- No goals: Planning shows an empty state and a create-goal action.
- New profile with first goal: profile is created and routed to Planning.
- Goal with invalid date or amount: form shows inline error instead of failing silently.
- Completed goal: monthly required amount is zero and progress is full.
- Over-capacity goal mix: Planning shows the combined monthly load against recent savings capacity.
