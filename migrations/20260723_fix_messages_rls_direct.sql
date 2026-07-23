-- Migration: Fix messages RLS for direct messages (encargada chat)
-- The existing "messages_participant" policy requires conversation_id,
-- but the encargada chat uses sender_id/receiver_id without conversations.
-- We add separate policies for direct messages (conversation_id IS NULL).

-- Allow SELECT on direct messages where user is sender or receiver
CREATE POLICY "messages_direct_select" ON public.messages
  FOR SELECT
  USING (
    conversation_id IS NULL
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );

-- Allow INSERT on direct messages where user is the sender
CREATE POLICY "messages_direct_insert" ON public.messages
  FOR INSERT
  WITH CHECK (
    conversation_id IS NULL
    AND sender_id = auth.uid()
  );

-- Allow UPDATE on direct messages (for marking as read)
CREATE POLICY "messages_direct_update" ON public.messages
  FOR UPDATE
  USING (
    conversation_id IS NULL
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );
