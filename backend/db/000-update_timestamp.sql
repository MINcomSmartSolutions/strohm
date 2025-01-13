CREATE FUNCTION update_timestamp() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

