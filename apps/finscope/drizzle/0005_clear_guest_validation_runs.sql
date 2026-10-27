-- Remove only the initial production validation records identified from the
-- corresponding test requests on 2026-10-27. Leave all other guest sessions,
-- quotas and account records untouched. Retain the browser QA session so its
-- cookie remains valid, with its test-only report credits restored.
DELETE FROM guest_report_jobs WHERE id IN (
  '14603393-2df1-4ad1-b4e0-1ee075ebb43c',
  '2efe2d4a-535c-4adc-aace-1dd4dc0c3c2e',
  '3b667e70-aa77-4115-ac5c-ea6b1bfb2224',
  '3c05ec8a-8af8-495e-81e8-cf6348cfc8bb'
) AND session_id IN (
  'a8d391af-a48b-4c29-bde5-640a719d0be7',
  'e701578e-dcf5-4303-bdcf-27e5a7817758'
);
--> statement-breakpoint
DELETE FROM guest_reports WHERE id = '7f77ec8d-97ad-4f58-8743-bf2d8eaef4ce'
  AND session_id = 'e701578e-dcf5-4303-bdcf-27e5a7817758';
--> statement-breakpoint
DELETE FROM guest_sessions WHERE id = 'a8d391af-a48b-4c29-bde5-640a719d0be7'
  AND created_at = 1793081390913;
