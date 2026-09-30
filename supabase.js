import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://yswizaskeftxpcphixiy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzd2l6YXNrZWZ0eHBjcGhpeGl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDM4NTcsImV4cCI6MjA5NzkxOTg1N30.SQEZzGCCsADmbYTNrpjw6k1uBs8mXnhn8IhzTHH6rto";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);