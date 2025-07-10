-- Create a function with extended timeout for large JSON uploads
CREATE OR REPLACE FUNCTION public.insert_large_json_upload(
  p_json_data JSONB,
  p_submission_id BIGINT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_upload_id BIGINT;
BEGIN
  -- Insert the JSON data into the uploads table
  INSERT INTO public.uploads (
    json_data,
    submission_id,
    platform
  ) VALUES (
    p_json_data,
    p_submission_id,
    p_platform
  ) RETURNING id INTO v_upload_id;
  
  RETURN v_upload_id;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER -- Runs with the permissions of the calling user
SET statement_timeout = '300s'; -- 5 minutes timeout