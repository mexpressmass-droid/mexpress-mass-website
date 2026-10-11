# M Express Dispatch — integration plan

This branch is a safe staging area. Production website remains unchanged until reviewed and deployed.

## Existing website
- Static HTML form in index.html currently posts to FormSubmit.
- script.js handles the booking modal and optional Places autocomplete.
- Do not switch the live form to an unconfigured endpoint.

## Supabase setup
1. Create a Supabase project in a US region and save its URL and anon/publishable key.
2. Run supabase/migrations/20261011_dispatch_foundation.sql in SQL editor.
3. Create admin and driver users through a secure provisioning workflow. Drivers enter usernames in the UI, resolved server-side to auth identities; never store plaintext passwords.
4. Add a validated, rate-limited Cloudflare Pages Function for public booking requests. Keep Supabase service-role credentials in Cloudflare secrets only, never in frontend code.
5. Add a validated authenticated endpoint for sequential driver transitions: assigned -> on_the_way -> arrived -> boarded -> completed. Check assigned_driver_id and log every transition.
6. Only after testing, change the form submission and retain email notifications using a trusted server-side email provider.

## Mobile app
React Native + Expo for iOS and Android. Driver pickup and drop-off addresses launch Google Maps directions using the phone's current location (with location permission). Show one next-status button at a time.

## Privacy
Trips include passenger names, phone numbers, and transportation information. Do not expose them to anonymous users or log them in public analytics. Apply data retention and access controls before production.

## Testing
Test form validation, spam protection, duplicate submissions, admin assignment, driver visibility, role enforcement, transitions, timezone handling, and end-to-end realtime updates.
