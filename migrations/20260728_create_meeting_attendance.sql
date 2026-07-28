CREATE TABLE IF NOT EXISTS meeting_attendance (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_seconds INT,
  UNIQUE(meeting_id, user_id)
);

ALTER TABLE meeting_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own attendance"
  ON meeting_attendance FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own attendance"
  ON meeting_attendance FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own attendance"
  ON meeting_attendance FOR UPDATE
  USING (user_id = auth.uid());
