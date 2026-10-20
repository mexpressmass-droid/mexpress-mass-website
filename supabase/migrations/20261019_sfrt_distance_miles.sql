-- Run in Supabase SQL Editor before deploying the mileage-enabled CSV importer.
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS distance_miles numeric(10,2);
ALTER TABLE public.trips ADD CONSTRAINT trips_distance_miles_nonnegative CHECK (distance_miles IS NULL OR distance_miles >= 0);
COMMENT ON COLUMN public.trips.distance_miles IS 'Planned trip distance in miles, imported from SFRT Miles; separate from fare and driver notes.';
