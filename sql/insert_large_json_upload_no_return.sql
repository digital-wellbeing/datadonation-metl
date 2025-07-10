-- Create a function with extended timeout for large JSON uploads that doesn't return data
-- This avoids RLS conflicts since anonymous users can't SELECT from the table
CREATE OR REPLACE FUNCTION public.insert_large_json_upload_no_return(
  p_json_data JSONB,
  p_submission_id BIGINT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  -- Insert the JSON data into the uploads table without returning anything
  INSERT INTO public.uploads (
    json_data,
    submission_id,
    platform
  ) VALUES (
    p_json_data,
    p_submission_id,
    p_platform
  );
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER -- Runs with the permissions of the calling user
SET statement_timeout = '300s'; -- 5 minutes timeout