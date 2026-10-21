-- NOTA: este archivo contiene ademas bloques CONSOLIDADOS de los antiguos sql/11-30 (buscar "BLOQUE CONSOLIDADO" al final).
-- ============================================================
-- 07_politicas.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 9 (POLITICAS RLS)
-- ============================================================
-- ============================================================
-- 9. POLITICAS RLS
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR COALESCE(get_my_role(), '') IN ('directora','admin'))
  WITH CHECK (auth.uid() = id OR COALESCE(get_my_role(), '') IN ('directora','admin'));

-- classrooms
DROP POLICY IF EXISTS "classrooms_all" ON public.classrooms;
CREATE POLICY "classrooms_all" ON public.classrooms FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

-- students
DROP POLICY IF EXISTS "students_staff_all" ON public.students;
CREATE POLICY "students_staff_all" ON public.students FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

DROP POLICY IF EXISTS "students_parent_select" ON public.students;
CREATE POLICY "students_parent_select" ON public.students FOR SELECT
  USING (parent_id = auth.uid());

-- attendance
DROP POLICY IF EXISTS "attendance_staff_all" ON public.attendance;
CREATE POLICY "attendance_staff_all" ON public.attendance FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

DROP POLICY IF EXISTS "attendance_parent_select" ON public.attendance;
CREATE POLICY "attendance_parent_select" ON public.attendance FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance.student_id AND s.parent_id = auth.uid()));

-- attendance_requests
DROP POLICY IF EXISTS "attendance_requests_all" ON public.attendance_requests;
CREATE POLICY "attendance_requests_all" ON public.attendance_requests FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
         EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance_requests.student_id AND s.parent_id = auth.uid()));

-- periods
DROP POLICY IF EXISTS "periods_all" ON public.periods;
CREATE POLICY "periods_all" ON public.periods FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- tasks
DROP POLICY IF EXISTS "tasks_staff_all" ON public.tasks;
CREATE POLICY "tasks_staff_all" ON public.tasks FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

-- task_evidences
DROP POLICY IF EXISTS "task_evidences_all" ON public.task_evidences;
CREATE POLICY "task_evidences_all" ON public.task_evidences FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR parent_id = auth.uid());

-- posts
DROP POLICY IF EXISTS "posts_select" ON public.posts;
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
    classroom_id IS NULL OR
    is_teacher_of_classroom(classroom_id) OR
    is_parent_of_classroom(classroom_id)
  )
);

DROP POLICY IF EXISTS "posts_insert" ON public.posts;
CREATE POLICY "posts_insert" ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = teacher_id AND COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'));

DROP POLICY IF EXISTS "posts_update" ON public.posts;
CREATE POLICY "posts_update" ON public.posts FOR UPDATE
  USING (auth.uid() = teacher_id AND COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'));

DROP POLICY IF EXISTS "posts_delete" ON public.posts;
CREATE POLICY "posts_delete" ON public.posts FOR DELETE
  USING (auth.uid() = teacher_id AND COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'));

-- comments
DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND (
    auth.uid() IS NOT NULL AND (
      COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
      p.classroom_id IS NULL OR
      is_teacher_of_classroom(p.classroom_id) OR
      is_parent_of_classroom(p.classroom_id)
    )
  ))
);

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND (
      COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') OR
      p.classroom_id IS NULL OR
      is_parent_of_classroom(p.classroom_id)
    )
  ));

-- likes
DROP POLICY IF EXISTS "likes_select" ON public.likes;
CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.posts p WHERE p.id = likes.post_id AND (
    auth.uid() IS NOT NULL AND (
      COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
      p.classroom_id IS NULL OR
      is_teacher_of_classroom(p.classroom_id) OR
      is_parent_of_classroom(p.classroom_id)
    )
  ))
);

DROP POLICY IF EXISTS "likes_all" ON public.likes;
CREATE POLICY "likes_all" ON public.likes FOR ALL USING (auth.uid() = user_id);

-- conversations
DROP POLICY IF EXISTS "conversations_participant" ON public.conversations;
CREATE POLICY "conversations_participant" ON public.conversations FOR ALL
  USING (user_is_participant(id, auth.uid()));

-- conversation_participants
DROP POLICY IF EXISTS "conversation_participants_all" ON public.conversation_participants;
CREATE POLICY "conversation_participants_all" ON public.conversation_participants FOR ALL
  USING (user_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin'));

-- messages
DROP POLICY IF EXISTS "messages_participant" ON public.messages;
CREATE POLICY "messages_participant" ON public.messages FOR ALL
  USING (user_is_participant(conversation_id, auth.uid()));

-- notifications
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- payments
DROP POLICY IF EXISTS "payments_staff_can_see_all" ON public.payments;
CREATE POLICY "payments_staff_can_see_all" ON public.payments FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "payments_staff_can_insert" ON public.payments;
CREATE POLICY "payments_staff_can_insert" ON public.payments FOR INSERT
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "payments_staff_can_update" ON public.payments;
CREATE POLICY "payments_staff_can_update" ON public.payments FOR UPDATE
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "payments_staff_can_delete" ON public.payments;
CREATE POLICY "payments_staff_can_delete" ON public.payments FOR DELETE
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "payments_parent_see_own" ON public.payments;
CREATE POLICY "payments_parent_see_own" ON public.payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.parent_id = auth.uid() AND s.deleted_at IS NULL));

DROP POLICY IF EXISTS "payments_parent_can_submit" ON public.payments;
CREATE POLICY "payments_parent_can_submit" ON public.payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.parent_id = auth.uid() AND s.deleted_at IS NULL));

DROP POLICY IF EXISTS "payments_parent_can_update_own" ON public.payments;
CREATE POLICY "payments_parent_can_update_own" ON public.payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.parent_id = auth.uid() AND s.deleted_at IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = payments.student_id AND s.parent_id = auth.uid() AND s.deleted_at IS NULL));

-- payment_audit_log
DROP POLICY IF EXISTS "audit_log_staff" ON public.payment_audit_log;
CREATE POLICY "audit_log_staff" ON public.payment_audit_log FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- incidents
DROP POLICY IF EXISTS "incidents_staff_all" ON public.incidents;
CREATE POLICY "incidents_staff_all" ON public.incidents FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

DROP POLICY IF EXISTS "incidents_parent_select" ON public.incidents;
CREATE POLICY "incidents_parent_select" ON public.incidents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = incidents.student_id AND s.parent_id = auth.uid()));

-- daily_logs
DROP POLICY IF EXISTS "daily_logs_staff_all" ON public.daily_logs;
CREATE POLICY "daily_logs_staff_all" ON public.daily_logs FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));

DROP POLICY IF EXISTS "daily_logs_parent_select" ON public.daily_logs;
CREATE POLICY "daily_logs_parent_select" ON public.daily_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = daily_logs.student_id AND s.parent_id = auth.uid()));

-- classroom_gallery
DROP POLICY IF EXISTS "classroom_gallery_all" ON public.classroom_gallery;
CREATE POLICY "classroom_gallery_all" ON public.classroom_gallery FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR is_parent_of_classroom(classroom_id));

-- classroom_chat
DROP POLICY IF EXISTS "classroom_chat_all" ON public.classroom_chat;
CREATE POLICY "classroom_chat_all" ON public.classroom_chat FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR is_parent_of_classroom(classroom_id));

-- grades
DROP POLICY IF EXISTS "grades_staff" ON public.grades;
CREATE POLICY "grades_staff" ON public.grades FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'))
  WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') AND (
      period_id IS NULL OR is_period_open(period_id) OR COALESCE(get_my_role(), '') IN ('directora','admin')
    )
  );

-- report_cards
DROP POLICY IF EXISTS "report_cards_staff" ON public.report_cards;
CREATE POLICY "report_cards_staff" ON public.report_cards FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "report_cards_parent" ON public.report_cards;
CREATE POLICY "report_cards_parent" ON public.report_cards FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = report_cards.student_id AND s.parent_id = auth.uid()));

-- inquiries
DROP POLICY IF EXISTS "inquiries_staff_all" ON public.inquiries;
CREATE POLICY "inquiries_staff_all" ON public.inquiries FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "inquiries_parent_own" ON public.inquiries;
CREATE POLICY "inquiries_parent_own" ON public.inquiries FOR ALL USING (parent_id = auth.uid());

-- school_settings
DROP POLICY IF EXISTS "school_settings_all" ON public.school_settings;
CREATE POLICY "school_settings_all" ON public.school_settings FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- system_events
DROP POLICY IF EXISTS "system_events_staff" ON public.system_events;
CREATE POLICY "system_events_staff" ON public.system_events FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- system_errors
DROP POLICY IF EXISTS "system_errors_select_staff" ON public.system_errors;
CREATE POLICY "system_errors_select_staff" ON public.system_errors FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "system_errors_insert_authenticated" ON public.system_errors;
CREATE POLICY "system_errors_insert_authenticated" ON public.system_errors FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- terms_acceptance
DROP POLICY IF EXISTS "terms_acceptance_own" ON public.terms_acceptance;
CREATE POLICY "terms_acceptance_own" ON public.terms_acceptance FOR ALL USING (user_id = auth.uid());

-- meetings
DROP POLICY IF EXISTS "meetings_all" ON public.meetings;
CREATE POLICY "meetings_all" ON public.meetings FOR ALL USING (auth.uid() IS NOT NULL);

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_staff" ON public.audit_logs;
CREATE POLICY "audit_logs_staff" ON public.audit_logs FOR SELECT
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- data_snapshots
DROP POLICY IF EXISTS "data_snapshots_staff" ON public.data_snapshots;
CREATE POLICY "data_snapshots_staff" ON public.data_snapshots FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- login_attempts
DROP POLICY IF EXISTS "login_attempts_staff" ON public.login_attempts;
CREATE POLICY "login_attempts_staff" ON public.login_attempts FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'));

-- door_punches
DROP POLICY IF EXISTS "punches_staff_all" ON public.door_punches;
CREATE POLICY "punches_staff_all" ON public.door_punches FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'));

DROP POLICY IF EXISTS "punches_parent_select" ON public.door_punches;
CREATE POLICY "punches_parent_select" ON public.door_punches FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = door_punches.student_id AND s.parent_id = auth.uid()));

-- staff_permits (con encargada)
DROP POLICY IF EXISTS "staff_permits_all" ON public.staff_permits;
CREATE POLICY "staff_permits_all" ON public.staff_permits FOR ALL
  USING (staff_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- parent_ratings (con encargada)
DROP POLICY IF EXISTS "parent_ratings_all" ON public.parent_ratings;
CREATE POLICY "parent_ratings_all" ON public.parent_ratings FOR ALL
  USING (parent_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- student_preregistrations
DROP POLICY IF EXISTS "preregistrations_insert_anon" ON public.student_preregistrations;
CREATE POLICY "preregistrations_insert_anon" ON public.student_preregistrations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "preregistrations_select_auth" ON public.student_preregistrations;
CREATE POLICY "preregistrations_select_auth" ON public.student_preregistrations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "preregistrations_update_auth" ON public.student_preregistrations;
CREATE POLICY "preregistrations_update_auth" ON public.student_preregistrations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- teacher_schedules
DROP POLICY IF EXISTS "teacher_schedules_staff_all" ON public.teacher_schedules;
CREATE POLICY "teacher_schedules_staff_all" ON public.teacher_schedules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = teacher_schedules.classroom_id AND c.teacher_id = auth.uid()));

-- schedule_event_logs
DROP POLICY IF EXISTS "schedule_event_logs_staff_all" ON public.schedule_event_logs;
CREATE POLICY "schedule_event_logs_staff_all" ON public.schedule_event_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = schedule_event_logs.classroom_id AND c.teacher_id = auth.uid()));

DROP POLICY IF EXISTS "schedule_event_logs_parent_select" ON public.schedule_event_logs;
CREATE POLICY "schedule_event_logs_parent_select" ON public.schedule_event_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.classroom_id = schedule_event_logs.classroom_id AND s.parent_id = auth.uid()));

-- caja_sessions
DROP POLICY IF EXISTS "caja_sessions_director" ON public.caja_sessions;
CREATE POLICY "caja_sessions_director" ON public.caja_sessions FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- accounting_journal
DROP POLICY IF EXISTS "accounting_journal_director" ON public.accounting_journal;
CREATE POLICY "accounting_journal_director" ON public.accounting_journal FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- payroll_records
DROP POLICY IF EXISTS "payroll_records_director" ON public.payroll_records;
CREATE POLICY "payroll_records_director" ON public.payroll_records FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- products
DROP POLICY IF EXISTS "products_staff_all" ON public.products;
CREATE POLICY "products_staff_all" ON public.products FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

DROP POLICY IF EXISTS "products_parent_select" ON public.products;
CREATE POLICY "products_parent_select" ON public.products FOR SELECT
  USING (is_active = true AND deleted_at IS NULL);

-- orders
DROP POLICY IF EXISTS "orders_parent_own" ON public.orders;
CREATE POLICY "orders_parent_own" ON public.orders FOR ALL
  USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "orders_staff_all" ON public.orders;
CREATE POLICY "orders_staff_all" ON public.orders FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- order_items
DROP POLICY IF EXISTS "order_items_parent_own" ON public.order_items;
CREATE POLICY "order_items_parent_own" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.parent_id = auth.uid()));

DROP POLICY IF EXISTS "order_items_staff_all" ON public.order_items;
CREATE POLICY "order_items_staff_all" ON public.order_items FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- inventory_movements
DROP POLICY IF EXISTS "inventory_movements_staff" ON public.inventory_movements;
CREATE POLICY "inventory_movements_staff" ON public.inventory_movements FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- invoices
DROP POLICY IF EXISTS "invoices_staff_all" ON public.invoices;
CREATE POLICY "invoices_staff_all" ON public.invoices FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- invoice_items
DROP POLICY IF EXISTS "invoice_items_staff_all" ON public.invoice_items;
CREATE POLICY "invoice_items_staff_all" ON public.invoice_items FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada'));

-- payment_concepts
DROP POLICY IF EXISTS "payment_concepts_staff" ON public.payment_concepts;
CREATE POLICY "payment_concepts_staff" ON public.payment_concepts FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

DROP POLICY IF EXISTS "Permitir insercion anonima de preinscripciones" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "Permitir insercion anonima de preinscripciones"
  ON public.student_preregistrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Permitir lectura completa a autenticados" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "Permitir lectura completa a autenticados"
  ON public.student_preregistrations
  FOR SELECT
  TO authenticated
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Permitir actualizacion a autenticados" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "Permitir actualizacion a autenticados"
  ON public.student_preregistrations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "invoices_public_read" ON storage.objects;

DROP POLICY IF EXISTS "invoices_auth_insert" ON storage.objects;

DROP POLICY IF EXISTS "invoices_auth_update" ON storage.objects;

DROP POLICY IF EXISTS "staff_permits_all" ON public.staff_permits;

DO $$ BEGIN
CREATE POLICY "Directores pueden gestionar caja" ON caja_sessions FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Contabilidad accesible" ON accounting_journal FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Nómina accesible por directores" ON payroll_records FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "teacher_schedules_staff_all" ON public.teacher_schedules;

DROP POLICY IF EXISTS "schedule_event_logs_staff_all" ON public.schedule_event_logs;

DROP POLICY IF EXISTS "schedule_event_logs_parent_select" ON public.schedule_event_logs;

DO $$ BEGIN
CREATE POLICY "messages_direct_select" ON public.messages
  FOR SELECT
  USING (
    conversation_id IS NULL
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_direct_insert" ON public.messages
  FOR INSERT
  WITH CHECK (
    conversation_id IS NULL
    AND sender_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_direct_update" ON public.messages
  FOR UPDATE
  USING (
    conversation_id IS NULL
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payroll_invoices_director" ON public.payroll_invoices FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Users can view their own attendance"
  ON meeting_attendance FOR SELECT
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "preregistrations_select_auth" ON public.student_preregistrations;

DROP POLICY IF EXISTS "preregistrations_update_auth" ON public.student_preregistrations;

DROP POLICY IF EXISTS "meetings_all" ON public.meetings;

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;

DO $$ BEGIN
CREATE POLICY "meetings_select" ON public.meetings FOR SELECT
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
    OR host_id = auth.uid()
    OR (target_id IS NOT NULL AND (
          is_parent_of_classroom(target_id) OR is_teacher_of_classroom(target_id)
        ))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;

DO $$ BEGIN
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT
  TO authenticated WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada')
    OR host_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;

DO $$ BEGIN
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  ) WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;

DO $$ BEGIN
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE
  TO authenticated USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada')
    OR host_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "routine_categories_staff_all" ON public.routine_categories;

DO $$ BEGIN
CREATE POLICY "routine_categories_staff_all" ON public.routine_categories FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "routine_categories_read" ON public.routine_categories;

DO $$ BEGIN
CREATE POLICY "routine_categories_read" ON public.routine_categories FOR SELECT
  USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "routine_events_staff_all" ON public.routine_events;

DO $$ BEGIN
CREATE POLICY "routine_events_staff_all" ON public.routine_events FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "routine_events_read" ON public.routine_events;

DO $$ BEGIN
CREATE POLICY "routine_events_read" ON public.routine_events FOR SELECT
  USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_routine_settings_staff_all" ON public.classroom_routine_settings;

DO $$ BEGIN
CREATE POLICY "classroom_routine_settings_staff_all" ON public.classroom_routine_settings FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_schedule_blocks_staff_all" ON public.classroom_schedule_blocks;

DO $$ BEGIN
CREATE POLICY "classroom_schedule_blocks_staff_all" ON public.classroom_schedule_blocks FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_schedule_block_events_staff_all" ON public.classroom_schedule_block_events;

DO $$ BEGIN
CREATE POLICY "classroom_schedule_block_events_staff_all" ON public.classroom_schedule_block_events FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_daily_schedule_staff_all" ON public.classroom_daily_schedule;

DO $$ BEGIN
CREATE POLICY "classroom_daily_schedule_staff_all" ON public.classroom_daily_schedule FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classroom_daily_schedule_read" ON public.classroom_daily_schedule;

DO $$ BEGIN
CREATE POLICY "classroom_daily_schedule_read" ON public.classroom_daily_schedule FOR SELECT
  USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS school_year_processes_select ON public.school_year_processes;

DO $$ BEGIN
CREATE POLICY school_year_processes_select ON public.school_year_processes
  FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "attachments_participant" ON public.message_attachments;

DO $$ BEGIN
CREATE POLICY "attachments_participant" ON public.message_attachments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_attachments.message_id
        AND public.user_is_participant(m.conversation_id, auth.uid())
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "reactions_participant" ON public.message_reactions;

DO $$ BEGIN
CREATE POLICY "reactions_participant" ON public.message_reactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND public.user_is_participant(m.conversation_id, auth.uid())
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND public.user_is_participant(m.conversation_id, auth.uid())
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "messages_participant" ON public.messages;

DROP POLICY IF EXISTS "messages_delete" ON public.messages;

DO $$ BEGIN
CREATE POLICY "messages_select" ON public.messages FOR SELECT
  USING (public.user_is_participant(conversation_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_insert" ON public.messages FOR INSERT
  WITH CHECK (
    public.user_is_participant(conversation_id, auth.uid()) AND
    sender_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_update" ON public.messages FOR UPDATE
  USING (
    public.user_is_participant(conversation_id, auth.uid()) AND
    (auth.uid() = sender_id OR COALESCE(public.get_my_role(), '') IN ('directora','admin'))
  )
  WITH CHECK (
    public.user_is_participant(conversation_id, auth.uid()) AND
    (auth.uid() = sender_id OR COALESCE(public.get_my_role(), '') IN ('directora','admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "messages_delete" ON public.messages FOR DELETE
  USING (
    public.user_is_participant(conversation_id, auth.uid()) AND
    (auth.uid() = sender_id OR COALESCE(public.get_my_role(), '') IN ('directora','admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "posts_update" ON public.posts;

DROP POLICY IF EXISTS "posts_delete" ON public.posts;

DROP POLICY IF EXISTS "comments_insert" ON public.comments;

DROP POLICY IF EXISTS "likes_all" ON public.likes;

DROP POLICY IF EXISTS "payment_concepts_read"   ON public.payment_concepts;

DROP POLICY IF EXISTS "payment_concepts_write"  ON public.payment_concepts;

DO $$ BEGIN
CREATE POLICY "payment_concepts_read" ON public.payment_concepts
  FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payment_concepts_write" ON public.payment_concepts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_select" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_select" ON public.students
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_insert" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_insert" ON public.students
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_update" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_update" ON public.students
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_delete" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_delete" ON public.students
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_self" ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_staff_read" ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_staff_read" ON public.profiles
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_staff_upsert" ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_staff_upsert" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles staff
      WHERE staff.id = auth.uid()
        AND staff.role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_staff_update" ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_staff_update" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles staff
      WHERE staff.id = auth.uid()
        AND staff.role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_select" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_select" ON public.payment_plans
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_insert" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_insert" ON public.payment_plans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_update" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_update" ON public.payment_plans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_select" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_insert" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_update" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_update" ON public.payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin', 'padre')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "prereg_select" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "prereg_select" ON public.student_preregistrations
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "prereg_insert" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "prereg_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "prereg_update" ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "prereg_update" ON public.student_preregistrations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('directora', 'asistente', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "students_staff_all" ON public.students;

DROP POLICY IF EXISTS "school_years_staff_all" ON public.school_years;

DO $$ BEGIN
CREATE POLICY "school_years_staff_all" ON public.school_years FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_staff_all" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_staff_all" ON public.payment_plans FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "plan_installments_staff_all" ON public.plan_installments;

DO $$ BEGIN
CREATE POLICY "plan_installments_staff_all" ON public.plan_installments FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "student_enrollments_staff_all" ON public.student_enrollments;

DO $$ BEGIN
CREATE POLICY "student_enrollments_staff_all" ON public.student_enrollments FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "student_charges_staff_all" ON public.student_charges;

DO $$ BEGIN
CREATE POLICY "student_charges_staff_all" ON public.student_charges FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "invoices_staff_all" ON public.invoices;

DROP POLICY IF EXISTS "students_staff_all"    ON public.students;

DROP POLICY IF EXISTS "students_padre_select" ON public.students;

DROP POLICY IF EXISTS "students_select"       ON public.students;

DROP POLICY IF EXISTS "students_insert"       ON public.students;

DROP POLICY IF EXISTS "students_update"       ON public.students;

DROP POLICY IF EXISTS "students_delete"       ON public.students;

DO $$ BEGIN
CREATE POLICY "students_padre_select" ON public.students FOR SELECT
  USING (COALESCE(get_my_role(),'') = 'padre' AND parent_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classrooms_read"          ON public.classrooms;

DROP POLICY IF EXISTS "classrooms_staff_manage"  ON public.classrooms;

DROP POLICY IF EXISTS "classrooms_select"        ON public.classrooms;

DROP POLICY IF EXISTS "classrooms_all"           ON public.classrooms;

DO $$ BEGIN
CREATE POLICY "classrooms_read" ON public.classrooms
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "classrooms_staff_manage" ON public.classrooms FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_self"               ON public.profiles;

DROP POLICY IF EXISTS "profiles_staff_select"       ON public.profiles;

DROP POLICY IF EXISTS "profiles_staff_manage"       ON public.profiles;

DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;

DROP POLICY IF EXISTS "profiles_staff_read"         ON public.profiles;

DROP POLICY IF EXISTS "profiles_all"                ON public.profiles;

DROP POLICY IF EXISTS "profiles_public_read"        ON public.profiles;

DROP POLICY IF EXISTS "profiles_padre_read"         ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_self" ON public.profiles FOR ALL
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_staff_manage" ON public.profiles FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_staff_all"    ON public.payments;

DROP POLICY IF EXISTS "payments_padre_select" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_staff_all" ON public.payments FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payments_padre_select" ON public.payments FOR SELECT
  USING (COALESCE(get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payments_padre_insert" ON public.payments;

DO $$ BEGIN
CREATE POLICY "payments_padre_insert" ON public.payments FOR INSERT
  WITH CHECK (COALESCE(get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "payment_plans_staff_all" ON public.payment_plans;

DO $$ BEGIN
CREATE POLICY "payment_plans_staff_all" ON public.payment_plans FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "prereg_public_insert" ON public.student_preregistrations;

DROP POLICY IF EXISTS "prereg_staff_all"     ON public.student_preregistrations;

DROP POLICY IF EXISTS "prereg_update"        ON public.student_preregistrations;

DROP POLICY IF EXISTS "prereg_all"           ON public.student_preregistrations;

DO $$ BEGIN
CREATE POLICY "prereg_public_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "prereg_staff_all" ON public.student_preregistrations FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payment_concepts_write" ON public.payment_concepts FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "parent_ratings_own"        ON public.parent_ratings;

DROP POLICY IF EXISTS "parent_ratings_staff_read" ON public.parent_ratings;

DO $$ BEGIN
CREATE POLICY "parent_ratings_own" ON public.parent_ratings FOR ALL
  USING (auth.uid() = parent_id) WITH CHECK (auth.uid() = parent_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "parent_ratings_staff_read" ON public.parent_ratings FOR SELECT
  USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "school_years_staff_all"  ON public.school_years;

DROP POLICY IF EXISTS "school_years_read"       ON public.school_years;

DO $$ BEGIN
CREATE POLICY "school_years_read" ON public.school_years
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "school_years_staff_all" ON public.school_years FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "school_settings_read"      ON public.school_settings;

DROP POLICY IF EXISTS "school_settings_staff_all" ON public.school_settings;

DO $$ BEGIN
CREATE POLICY "school_settings_read" ON public.school_settings
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "school_settings_staff_all" ON public.school_settings FOR ALL
  USING      (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "invoices_staff_all"    ON public.invoices;

DROP POLICY IF EXISTS "invoices_padre_select" ON public.invoices;

DO $$ BEGIN
CREATE POLICY "invoices_padre_select" ON public.invoices FOR SELECT
  USING (
    COALESCE(get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Enable all for staff"  ON public.students;

DROP POLICY IF EXISTS "students_padre_select" ON public.students;

DO $$ BEGIN
CREATE POLICY "students_padre_select" ON public.students
  FOR SELECT
  USING (
    COALESCE(get_my_role(), '') = 'padre'
    AND parent_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_staff_select" ON public.profiles
  FOR SELECT USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "profiles_staff_manage" ON public.profiles
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payments_staff_all" ON public.payments
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payments_padre_select" ON public.payments
  FOR SELECT
  USING (
    COALESCE(get_my_role(), '') = 'padre'
    AND student_id IN (
      SELECT id FROM public.students WHERE parent_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "prereg_public_insert" ON public.student_preregistrations
  FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "prereg_staff_all" ON public.student_preregistrations
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "payment_concepts_write" ON public.payment_concepts
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "classrooms_read"  ON public.classrooms;

DO $$ BEGIN
CREATE POLICY "classrooms_read" ON public.classrooms
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "classrooms_staff_manage" ON public.classrooms
  FOR ALL
  USING      (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "parent_ratings_staff_read" ON public.parent_ratings
  FOR SELECT USING (
    COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "profiles_padre_read"     ON public.profiles;

DROP POLICY IF EXISTS "profiles_authenticated"  ON public.profiles;

DO $$ BEGIN
CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Permitir insercion anonima de preinscripciones" ON public.student_preregistrations;

DROP POLICY IF EXISTS "Permitir lectura completa a autenticados" ON public.student_preregistrations;

-- ============================================================
-- FIX PERSISTENTE: Lectura de estudiantes por staff
-- Problema: Más arriba este mismo archivo borra las políticas
-- "students_staff_all" y "students_select", dejando SOLO
-- "students_padre_select" (padres). Por eso los paneles de
-- directora/asistente ven 0 estudiantes aunque existan registros.
-- Este bloque es idempotente y se ejecuta el ÚLTIMO para ganar.
-- ============================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "students_staff_all" ON public.students;
  CREATE POLICY "students_staff_all" ON public.students FOR ALL
    TO authenticated
    USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'))
    WITH CHECK (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra','encargada'));
END $$;

-- Garantizar lectura de perfiles del staff (docentes/asistentes en KPIs)
DO $$ BEGIN
  DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
  CREATE POLICY "profiles_authenticated_read" ON public.profiles FOR SELECT
    TO authenticated USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- #################################################################
-- BLOQUE CONSOLIDADO DESDE los antiguos sql/11-30
-- (integrado el 2026-10-19; idempotente y re-ejecutable)
-- #################################################################
-- ================================================================
-- SECCIÓN 3 — STORAGE + REALTIME                    [original 13]
-- ================================================================
-- Corrige la subida de videos al muro (HTTP 400): el código sube los
-- videos al bucket `posts`, cuyo allowed_mime_types solo aceptaba
-- imágenes y PDF.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'posts',
  'posts',
  true,
  26214400,
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime','video/ogg',
    'video/x-matroska','video/3gpp','video/x-msvideo'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public              = true,
      file_size_limit     = 26214400,
      allowed_mime_types  = EXCLUDED.allowed_mime_types;

-- `karpus-uploads` se mantiene como solo-imágenes/PDF a propósito:
-- es el bucket de avatares y documentos.

-- UPDATE (upsert) y DELETE faltantes en `posts`
DROP POLICY IF EXISTS "posts_auth_update" ON storage.objects;
CREATE POLICY "posts_auth_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'posts' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'posts' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "posts_auth_delete" ON storage.objects;
CREATE POLICY "posts_auth_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'posts' AND auth.role() = 'authenticated');

-- ================================================================
-- SECCIÓN 4 — RLS BASE
-- ================================================================

-- ----------------------------------------------------------------
-- 4a. Tablas creadas en 01_base sin RLS        [original 12]
--     Sin RLS, PostgREST las expone a cualquier rol con grant.
--     Habilitar RLS sin política es deny-all, así que cada ENABLE va
--     acompañado de sus políticas en la misma transacción.
-- ----------------------------------------------------------------
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'academic_areas') THEN

    DROP POLICY IF EXISTS "academic_areas_select" ON public.academic_areas;
    CREATE POLICY "academic_areas_select" ON public.academic_areas FOR SELECT
      USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada','maestra'));

    DROP POLICY IF EXISTS "academic_areas_write" ON public.academic_areas;
    CREATE POLICY "academic_areas_write" ON public.academic_areas FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
      WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

    ALTER TABLE public.academic_areas ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'competencies') THEN

    DROP POLICY IF EXISTS "competencies_select" ON public.competencies;
    CREATE POLICY "competencies_select" ON public.competencies FOR SELECT
      USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin','encargada','maestra'));

    DROP POLICY IF EXISTS "competencies_write" ON public.competencies;
    CREATE POLICY "competencies_write" ON public.competencies FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
      WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

    ALTER TABLE public.competencies ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- competency_scores: calificaciones por competencia. Mismo tratamiento
-- que grades: el personal escribe (con período abierto o directora/
-- admin), el padre solo lee las notas de su propio hijo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'competency_scores') THEN

    DROP POLICY IF EXISTS "competency_scores_staff" ON public.competency_scores;
    CREATE POLICY "competency_scores_staff" ON public.competency_scores FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada'))
      WITH CHECK (
        COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') AND (
          period_id IS NULL
          OR is_period_open(period_id)
          OR COALESCE(get_my_role(), '') IN ('directora','admin')
        )
      );

    DROP POLICY IF EXISTS "competency_scores_parent" ON public.competency_scores;
    CREATE POLICY "competency_scores_parent" ON public.competency_scores FOR SELECT
      USING (is_parent_of_student(student_id));

    ALTER TABLE public.competency_scores ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'student_promotions') THEN

    DROP POLICY IF EXISTS "student_promotions_staff_all" ON public.student_promotions;
    CREATE POLICY "student_promotions_staff_all" ON public.student_promotions FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
      WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));

    ALTER TABLE public.student_promotions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- school_year_archive: snapshot JSONb de alumnos, pagos y notas.
-- La tabla más sensible del grupo: solo directora/admin.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'school_year_archive') THEN

    DROP POLICY IF EXISTS "school_year_archive_staff_all" ON public.school_year_archive;
    CREATE POLICY "school_year_archive_staff_all" ON public.school_year_archive FOR ALL
      USING (COALESCE(get_my_role(), '') IN ('directora','admin'))
      WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','admin'));

    ALTER TABLE public.school_year_archive ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

COMMIT;

-- ----------------------------------------------------------------
-- 4b. comments / likes: COALESCE(..., false) para no dar 403 por NULL
--     [original 13, refactor de policies]
-- ----------------------------------------------------------------
-- parent_id para respuestas a comentarios (si no existe ya)
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id bigint
  REFERENCES public.comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id_parent_id
  ON public.comments(post_id, parent_id) INCLUDE (id, created_at);

DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = comments.post_id
      AND auth.uid() IS NOT NULL
      AND (
        COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
        COALESCE(p.classroom_id IS NULL, true) OR
        COALESCE(is_teacher_of_classroom(p.classroom_id), false) OR
        COALESCE(is_parent_of_classroom(p.classroom_id), false)
      )
  )
);

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = comments.post_id
      AND (
        COALESCE(get_my_role(), '') IN ('directora','asistente','maestra','admin','encargada') OR
        COALESCE(p.classroom_id IS NULL, true) OR
        COALESCE(is_parent_of_classroom(p.classroom_id), false)
      )
  )
);

DROP POLICY IF EXISTS "likes_select" ON public.likes;
CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = likes.post_id
      AND auth.uid() IS NOT NULL
      AND (
        COALESCE(get_my_role(), '') IN ('directora','asistente','admin','maestra','encargada') OR
        COALESCE(p.classroom_id IS NULL, true) OR
        COALESCE(is_teacher_of_classroom(p.classroom_id), false) OR
        COALESCE(is_parent_of_classroom(p.classroom_id), false)
      )
  )
);

DROP POLICY IF EXISTS "likes_all" ON public.likes;
CREATE POLICY "likes_all" ON public.likes FOR ALL USING (auth.uid() = user_id);

-- (NOTA: el 25 creaba comments_auth/likes_auth USING(true); se omiten
--  deliberadamente por ser más abiertas que estas.)

-- ----------------------------------------------------------------
-- 4c. login_attempts: INSERT público para registrar intentos de login
--     [original 16]
--     La política login_attempts_staff solo daba acceso a directora/
--     admin; los inserts desde js/login.js (anon/padre) recibían 401.
-- ----------------------------------------------------------------
BEGIN;

ALTER TABLE IF EXISTS public.login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS login_attempts_self_insert ON public.login_attempts;
CREATE POLICY login_attempts_self_insert ON public.login_attempts
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS login_attempts_staff_read ON public.login_attempts;
CREATE POLICY login_attempts_staff_read ON public.login_attempts
    FOR SELECT
    TO authenticated
    USING (COALESCE(get_my_role(), '') IN ('directora','admin','asistente'));

COMMIT;

-- ----------------------------------------------------------------
-- 4d. ATTENDANCE                              [original 24]
--     Política de escritura que acepta al personal POR ROL o al
--     docente del aula (is_teacher_of_classroom): no depende de una
--     sola vía, así el INSERT de la maestra no se bloquea aunque
--     get_my_role() devuelva ''.
-- ----------------------------------------------------------------
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'attendance'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.attendance', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "attendance_staff_all" ON public.attendance
  FOR ALL
  TO authenticated
  USING (
    COALESCE(public.get_my_role(), '') IN (
      'directora', 'asistente', 'maestra', 'encargada', 'admin'
    )
    OR public.is_teacher_of_classroom(classroom_id)
  )
  WITH CHECK (
    COALESCE(public.get_my_role(), '') IN (
      'directora', 'asistente', 'maestra', 'encargada', 'admin'
    )
    OR public.is_teacher_of_classroom(classroom_id)
  );

CREATE POLICY "attendance_parent_select" ON public.attendance
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.get_my_role(), '') = 'padre'
    AND student_id IN (
      SELECT id FROM public.students WHERE parent_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance TO service_role;
DO $$
BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
    pg_get_serial_sequence('public.attendance','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ----------------------------------------------------------------
-- 4e. RLS general del sistema                  [original 25]
--     profiles / students / messages / posts / daily_logs /
--     classroom_daily_schedule / tasks / task_evidences / eval_* /
--     notifications / classroom_routine_settings / preregistrations.
--     (attendance, comments y likes NO se repiten aquí: sus políticas
--      definitivas son las de 4b y 4d.)
-- ----------------------------------------------------------------

-- 1. PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_manage"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_all"                ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_staff_upsert"       ON public.profiles;
CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_staff_manage" ON public.profiles
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, service_role;

-- 2. STUDENTS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "students_staff_all"     ON public.students;
DROP POLICY IF EXISTS "students_padre_select"  ON public.students;
DROP POLICY IF EXISTS "students_select"        ON public.students;
DROP POLICY IF EXISTS "students_insert"        ON public.students;
DROP POLICY IF EXISTS "students_update"        ON public.students;
DROP POLICY IF EXISTS "students_delete"        ON public.students;
DROP POLICY IF EXISTS "students_all"           ON public.students;
DROP POLICY IF EXISTS "students_read_all"      ON public.students;
DROP POLICY IF EXISTS "students_directora_all" ON public.students;
CREATE POLICY "students_staff_all" ON public.students
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "students_padre_select" ON public.students
  FOR SELECT TO authenticated
  USING (COALESCE(public.get_my_role(),'') = 'padre' AND parent_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.students TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.students','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. MESSAGES
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_authenticated_all" ON public.messages;
DROP POLICY IF EXISTS "messages_staff_all"         ON public.messages;
DROP POLICY IF EXISTS "messages_select"            ON public.messages;
DROP POLICY IF EXISTS "messages_insert"            ON public.messages;
DROP POLICY IF EXISTS "messages_update"            ON public.messages;
DROP POLICY IF EXISTS "messages_delete"            ON public.messages;
DROP POLICY IF EXISTS "messages_all"               ON public.messages;
DROP POLICY IF EXISTS "messages_read"              ON public.messages;
DROP POLICY IF EXISTS "messages_write"             ON public.messages;
DROP POLICY IF EXISTS "messages_own"               ON public.messages;
CREATE POLICY "messages_read" ON public.messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid()
    OR COALESCE(public.get_my_role(),'') IN ('directora','asistente','admin','encargada'));
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR COALESCE(public.get_my_role(),'') IN ('directora','admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.messages','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. POSTS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_staff_all"     ON public.posts;
DROP POLICY IF EXISTS "posts_parent_read"   ON public.posts;
DROP POLICY IF EXISTS "posts_own"           ON public.posts;
DROP POLICY IF EXISTS "posts_select"        ON public.posts;
DROP POLICY IF EXISTS "posts_insert"        ON public.posts;
DROP POLICY IF EXISTS "posts_update"        ON public.posts;
DROP POLICY IF EXISTS "posts_delete"        ON public.posts;
DROP POLICY IF EXISTS "posts_all"           ON public.posts;
DROP POLICY IF EXISTS "posts_read"          ON public.posts;
DROP POLICY IF EXISTS "posts_authenticated" ON public.posts;
CREATE POLICY "posts_staff_all" ON public.posts
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "posts_parent_read" ON public.posts
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(),'') = 'padre'
    AND (student_id IS NULL
      OR student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()))
    AND (classroom_id IS NULL
      OR classroom_id IN (SELECT classroom_id FROM public.students WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL))
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.posts','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5. DAILY_LOGS
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_logs_staff_all"   ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_parent_read" ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_select"      ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_insert"      ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_update"      ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_all"         ON public.daily_logs;
CREATE POLICY "daily_logs_staff_all" ON public.daily_logs
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "daily_logs_parent_read" ON public.daily_logs
  FOR SELECT TO authenticated
  USING (COALESCE(public.get_my_role(),'') = 'padre'
    AND student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_logs TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.daily_logs','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6. CLASSROOM_DAILY_SCHEDULE (rutina del aula)
ALTER TABLE public.classroom_daily_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cds_staff_all"   ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_parent_read" ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_select"      ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_insert"      ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_update"      ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_all"         ON public.classroom_daily_schedule;
DROP POLICY IF EXISTS "cds_read"        ON public.classroom_daily_schedule;
CREATE POLICY "cds_staff_all" ON public.classroom_daily_schedule
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "cds_parent_read" ON public.classroom_daily_schedule
  FOR SELECT TO authenticated
  USING (COALESCE(public.get_my_role(),'') = 'padre'
    AND classroom_id IN (SELECT classroom_id FROM public.students WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.classroom_daily_schedule TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.classroom_daily_schedule','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 7. TASKS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_staff_all"   ON public.tasks;
DROP POLICY IF EXISTS "tasks_parent_read" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_update"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_all"         ON public.tasks;
DROP POLICY IF EXISTS "tasks_read"        ON public.tasks;
CREATE POLICY "tasks_staff_all" ON public.tasks
  FOR ALL TO authenticated
  USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'));
CREATE POLICY "tasks_parent_read" ON public.tasks
  FOR SELECT TO authenticated
  USING (COALESCE(public.get_my_role(),'') = 'padre'
    AND classroom_id IN (SELECT classroom_id FROM public.students WHERE parent_id = auth.uid() AND classroom_id IS NOT NULL));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated, service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.tasks','id')); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 8. TASK_EVIDENCES
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='task_evidences') THEN
    EXECUTE 'ALTER TABLE public.task_evidences ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "te_staff_all"  ON public.task_evidences';
    EXECUTE 'DROP POLICY IF EXISTS "te_parent_own" ON public.task_evidences';
    EXECUTE $p$ CREATE POLICY "te_staff_all" ON public.task_evidences FOR ALL TO authenticated
      USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
      WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin')) $p$;
    EXECUTE $p$ CREATE POLICY "te_parent_own" ON public.task_evidences FOR ALL TO authenticated
      USING (student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid()))
      WITH CHECK (student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.task_evidences TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 9. EVAL TABLES (lectura básica; la capa final de visibilidad va en
--    la sección 7, a partir de 27_fix_maestra_visibility)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eval_evaluations','eval_areas','eval_periods','eval_modules','eval_activities'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_staff_all" ON public.%I', t, t);
      EXECUTE format($p$
        CREATE POLICY "eval_%s_staff_all" ON public.%I
          FOR ALL TO authenticated
          USING (true)
          WITH CHECK (COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
      $p$, t, t);
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO authenticated,service_role', t);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'eval RLS: %', SQLERRM; END $$;

-- 10. NOTIFICATIONS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "notifications_own" ON public.notifications';
    EXECUTE $p$ CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
      USING (user_id = auth.uid() OR COALESCE(public.get_my_role(),'') IN ('directora','admin','asistente'))
      WITH CHECK (true) $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.notifications TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 11. CLASSROOM_ROUTINE_SETTINGS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='classroom_routine_settings') THEN
    EXECUTE 'ALTER TABLE public.classroom_routine_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "crs_staff_all"   ON public.classroom_routine_settings';
    EXECUTE 'DROP POLICY IF EXISTS "crs_parent_read" ON public.classroom_routine_settings';
    EXECUTE $p$ CREATE POLICY "crs_staff_all" ON public.classroom_routine_settings FOR ALL TO authenticated
      USING      (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin'))
      WITH CHECK (COALESCE(public.get_my_role(),'') IN ('directora','asistente','maestra','encargada','admin')) $p$;
    EXECUTE $p$ CREATE POLICY "crs_parent_read" ON public.classroom_routine_settings FOR SELECT TO authenticated
      USING (COALESCE(public.get_my_role(),'') = 'padre') $p$;
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.classroom_routine_settings TO authenticated,service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 12. STUDENT_PREREGISTRATIONS
--     NOTA: la política prereg_anon_insert_only que sigue se elimina en
--     la sección 8 al instalar la RPC submit_preregistration (19), que
--     es la vía pública definitiva (el INSERT directo de anon devolvía
--     42501 al SELECT de retorno "Prefer: return=representation").
ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prereg_anon_insert_only"          ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_authenticated_insert_only" ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_select"              ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_update"              ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_delete"              ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_public_insert"             ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_staff_all"                 ON public.student_preregistrations;
DROP POLICY IF EXISTS "preregistrations_insert_public"   ON public.student_preregistrations;
DROP POLICY IF EXISTS "preregistrations_select_staff"    ON public.student_preregistrations;
DROP POLICY IF EXISTS "preregistrations_update_staff"    ON public.student_preregistrations;
DROP POLICY IF EXISTS "Permitir insercion publica"       ON public.student_preregistrations;
DROP POLICY IF EXISTS "Permitir lectura staff"           ON public.student_preregistrations;

CREATE POLICY "prereg_anon_insert_only" ON public.student_preregistrations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "prereg_authenticated_insert_only" ON public.student_preregistrations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "prereg_staff_select" ON public.student_preregistrations
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada')
  );

CREATE POLICY "prereg_staff_update" ON public.student_preregistrations
  FOR UPDATE TO authenticated
  USING      (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'))
  WITH CHECK (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'));

CREATE POLICY "prereg_staff_delete" ON public.student_preregistrations
  FOR DELETE TO authenticated
  USING (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_preregistrations TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.student_preregistrations TO anon;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, anon',
    pg_get_serial_sequence('public.student_preregistrations','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ----------------------------------------------------------------
-- 5h. RLS (una política por comando; se limpian las del 21)
-- ----------------------------------------------------------------
ALTER TABLE public.school_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_month_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_activity_evidences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_parent_select"  ON public.school_activities;
DROP POLICY IF EXISTS "activities_staff_select"   ON public.school_activities;
DROP POLICY IF EXISTS "activities_admin_all"      ON public.school_activities;
DROP POLICY IF EXISTS "activities_teacher_update" ON public.school_activities;

DROP POLICY IF EXISTS school_activities_select_staff   ON public.school_activities;
DROP POLICY IF EXISTS school_activities_select_maestra ON public.school_activities;
DROP POLICY IF EXISTS school_activities_select_padre   ON public.school_activities;
DROP POLICY IF EXISTS school_activities_insert_staff   ON public.school_activities;
DROP POLICY IF EXISTS school_activities_update_staff   ON public.school_activities;
DROP POLICY IF EXISTS school_activities_update_maestra ON public.school_activities;
DROP POLICY IF EXISTS school_activities_delete_staff   ON public.school_activities;

CREATE POLICY school_activities_select_staff
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    );

CREATE POLICY school_activities_select_maestra
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'maestra'
            AND (
                 assigned_to = auth.uid()
              OR classroom_id IN (SELECT c.id FROM public.classrooms c WHERE c.teacher_id = auth.uid())
            )
        )
        AND status IN ('scheduled','published','in_progress','completed')
    );

CREATE POLICY school_activities_select_padre
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            JOIN public.students s ON s.parent_id = p.id
            WHERE p.id = auth.uid()
              AND p.role = 'padre'
              AND (
                   s.classroom_id = school_activities.classroom_id
                OR school_activities.target_audience IN ('todo_el_centro')
              )
        )
        AND status IN ('published','in_progress','completed')
    );

CREATE POLICY school_activities_insert_staff
    ON public.school_activities FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
        AND created_by = auth.uid()
    );

CREATE POLICY school_activities_update_staff
    ON public.school_activities FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    );

CREATE POLICY school_activities_update_maestra
    ON public.school_activities FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'maestra'
            AND (
                 assigned_to = auth.uid()
              OR classroom_id IN (SELECT c.id FROM public.classrooms c WHERE c.teacher_id = auth.uid())
            )
        )
        AND status IN ('scheduled','published','in_progress')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'maestra')
        AND status IN ('scheduled','published','in_progress','completed')
    );

CREATE POLICY school_activities_delete_staff
    ON public.school_activities FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    );

DROP POLICY IF EXISTS "month_configs_select"    ON public.school_month_configs;
DROP POLICY IF EXISTS "month_configs_admin_all" ON public.school_month_configs;

CREATE POLICY "month_configs_select"
  ON public.school_month_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "month_configs_admin_all"
  ON public.school_month_configs FOR ALL TO authenticated
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin'));

DROP POLICY IF EXISTS "evidences_select" ON public.school_activity_evidences;
DROP POLICY IF EXISTS "evidences_insert" ON public.school_activity_evidences;
DROP POLICY IF EXISTS "evidences_delete" ON public.school_activity_evidences;

CREATE POLICY "evidences_select"
  ON public.school_activity_evidences FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','maestra','admin')
    OR EXISTS (
      SELECT 1 FROM public.school_activities a
      WHERE a.id = activity_id AND a.status = 'published'
    )
  );

CREATE POLICY "evidences_insert"
  ON public.school_activity_evidences FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin')
    OR EXISTS (
      SELECT 1 FROM public.school_activities a
      WHERE a.id = activity_id AND (a.assigned_to = auth.uid() OR a.assigned_teacher_id = auth.uid())
    )
  );

CREATE POLICY "evidences_delete"
  ON public.school_activity_evidences FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR COALESCE(get_my_role(), '') IN ('directora','asistente','encargada','admin')
  );

-- ----------------------------------------------------------------
-- RLS — políticas granulares (evitar FOR ALL para INSERT)
-- ----------------------------------------------------------------
ALTER TABLE public.supervision_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interventions         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervision_sessions_select_self_staff ON public.supervision_sessions;
CREATE POLICY supervision_sessions_select_self_staff
    ON public.supervision_sessions FOR SELECT USING (
      usuario_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
    );

DROP POLICY IF EXISTS supervision_sessions_insert_staff ON public.supervision_sessions;
CREATE POLICY supervision_sessions_insert_staff
    ON public.supervision_sessions FOR INSERT WITH CHECK (
      auth.uid() IS NOT NULL
      AND usuario_id = auth.uid()
      AND role IN (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    );

DROP POLICY IF EXISTS supervision_sessions_update_self ON public.supervision_sessions;
CREATE POLICY supervision_sessions_update_self
    ON public.supervision_sessions FOR UPDATE USING (usuario_id = auth.uid())
    WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS supervision_audit_select_staff ON public.supervision_audit_log;
CREATE POLICY supervision_audit_select_staff
    ON public.supervision_audit_log FOR SELECT USING (
      usuario_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
    );

DROP POLICY IF EXISTS supervision_audit_insert_self ON public.supervision_audit_log;
CREATE POLICY supervision_audit_insert_self
    ON public.supervision_audit_log FOR INSERT WITH CHECK (
      auth.uid() IS NOT NULL
      AND usuario_id = auth.uid()
    );
-- audit log append-only. NO hay políticas de UPDATE/DELETE (quedan bloqueadas)

DROP POLICY IF EXISTS interventions_select_staff ON public.interventions;
CREATE POLICY interventions_select_staff
    ON public.interventions FOR SELECT USING (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR teacher_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
    );

DROP POLICY IF EXISTS interventions_insert_staff ON public.interventions;
CREATE POLICY interventions_insert_staff
    ON public.interventions FOR INSERT WITH CHECK (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada','maestra'))
    );

DROP POLICY IF EXISTS interventions_update_assigned ON public.interventions;
CREATE POLICY interventions_update_assigned
    ON public.interventions FOR UPDATE USING (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'directora')
    )
    WITH CHECK (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'directora')
    );

-- ================================================================
-- SECCIÓN 7 — RLS FINAL / VISIBILIDAD MAESTRA      [original 27]
-- ================================================================
-- En el Panel Maestra no se veían las áreas/actividades del boletín
-- ni las tareas del aula: RLS en eval_*/tasks sin políticas con el rol
-- "maestra" (deny-all silencioso). Aquí la capa definitiva, que además
-- sobrescribe las select_maestra/select_padre del 23 para que las
-- maestras también vean las actividades de TODO EL COLEGIO y las
-- actividades sin aula (classroom_id NULL).

-- 1. Tablas de ESTRUCTURA del boletín: lectura abierta a cualquier
--    usuario autenticado (el padre necesita ver nombres de áreas y
--    actividades), escritura sólo para personal.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'eval_evaluations','eval_areas','eval_competencies','eval_periods',
    'eval_modules','eval_activities','eval_formulas'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_staff_all" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "staff_all_%s"    ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_read"     ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "eval_%s_staff_write" ON public.%I', t, t);
      EXECUTE format($p$
        CREATE POLICY "eval_%s_read" ON public.%I
          FOR SELECT TO authenticated USING (true)
      $p$, t, t);
      EXECUTE format($p$
        CREATE POLICY "eval_%s_staff_write" ON public.%I
          FOR INSERT, UPDATE, DELETE TO authenticated
          USING (COALESCE(public.get_my_role(),'''') IN
            (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
          WITH CHECK (COALESCE(public.get_my_role(),'''') IN
            (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
      $p$, t, t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', t);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'eval estructura: %', SQLERRM; END $$;

-- 2. Tablas de NOTAS del boletín: lectura/escritura del personal
--    (las políticas "parent_read_*" definidas arriba en 10_fixes se
--     conservan).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'eval_scores','eval_evidences','eval_area_notes',
    'eval_score_history','eval_boleta_notes'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "staff_all_%s" ON public.%I', t, t);
      EXECUTE format($p$
        CREATE POLICY "staff_all_%s" ON public.%I
          FOR ALL TO authenticated
          USING (COALESCE(public.get_my_role(),'''') IN
            (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
          WITH CHECK (COALESCE(public.get_my_role(),'''') IN
            (''directora'',''asistente'',''maestra'',''encargada'',''admin''))
      $p$, t, t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', t);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'eval notas: %', SQLERRM; END $$;

-- 3. boletin_ensure_structure: la maestra debe poder ejecutarla para
--    que existan áreas/períodos/módulos por defecto.
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.boletin_ensure_structure(bigint) TO authenticated';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. ACTIVIDADES ESCOLARES: la maestra ve las suyas, las de su aula,
--    las sin aula (classroom_id NULL) y las de todo el centro.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='school_activities') THEN
    EXECUTE 'ALTER TABLE public.school_activities ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS school_activities_select_maestra ON public.school_activities';
    EXECUTE $p$ CREATE POLICY school_activities_select_maestra
      ON public.school_activities FOR SELECT TO authenticated
      USING (
        COALESCE(public.get_my_role(),'''') IN (''directora'',''asistente'',''admin'',''encargada'')
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = ''maestra''
            AND (
                 school_activities.assigned_to = auth.uid()
              OR school_activities.assigned_teacher_id = auth.uid()
              OR school_activities.target_audience = ''todo_el_centro''
              OR school_activities.classroom_id IS NULL
              OR school_activities.classroom_id IN (
                   SELECT c.id FROM public.classrooms c WHERE c.teacher_id = auth.uid())
            )
        )
      ) $p$;
    EXECUTE 'DROP POLICY IF EXISTS school_activities_select_padre ON public.school_activities';
    EXECUTE $p$ CREATE POLICY school_activities_select_padre
      ON public.school_activities FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.students s ON s.parent_id = p.id
          WHERE p.id = auth.uid()
            AND p.role = ''padre''
            AND (
                 s.classroom_id = school_activities.classroom_id
              OR school_activities.target_audience IN (''todo_el_centro'')
            )
        )
        AND school_activities.status IN (''published'',''in_progress'',''completed'')
      ) $p$;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'school_activities: %', SQLERRM; END $$;

-- ----------------------------------------------------------------
-- 8b. submit_preregistration(p_data)            [original 19]
--     El formulario público fallaba con HTTP 401 / 42501: el INSERT se
--     permitía y la fila SE GUARDABA, pero el "Prefer:
--     return=representation" lanzaba un SELECT que RLS bloqueaba para
--     anon (no había política SELECT pública). El navegador veía error
--     y el padre reenviaba → duplicados.
--     La solución: el INSERT pasa por una función SECURITY DEFINER que
--     devuelve ÚNICAMENTE el id generado. Además descarta `status` y
--     `director_authorization_approved`: el público no puede saltarse
--     la revisión de Dirección ni fijar el estado.
-- ----------------------------------------------------------------
REVOKE INSERT ON public.student_preregistrations FROM anon;
DROP POLICY IF EXISTS "prereg_anon_insert_only" ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_authenticated_insert_only" ON public.student_preregistrations;
CREATE POLICY "prereg_authenticated_insert_only"
  ON public.student_preregistrations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ----------------------------------------------------------------
-- 8c. LIMPIEZA TOTAL DE POLÍTICAS HEREDADAS DE PREINSCRIPCIÓN
--     (arreglo del ERROR 401 / 42501 definitivo; subsume al archivo
--      FIX_FINAL_PREINSCRIPCION_RLS.sql, ya eliminado)
--     07_politicas.sql creó ~8 policies antiguas sobre
--     student_preregistrations (prereg_insert, prereg_update,
--     "Permitir insercion anonima…", etc.). PostgreSQL evalúa TODAS
--     las policies que aplican a un comando en modo AND: una sola
--     policy vieja con WITH CHECK get_my_role() = 'directora' bastaba
--     para romper los INSERT/UPDATE del panel (42501). Además faltaba
--     GRANT USAGE ON SCHEMA public (el #1 olvidado del 401).
--     Solución idempotente: borrar TODAS las policies heredadas y
--     recrear exactamente el conjunto final.
-- ----------------------------------------------------------------
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'student_preregistrations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.student_preregistrations', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "prereg_authenticated_insert_only" ON public.student_preregistrations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "prereg_staff_select" ON public.student_preregistrations
  FOR SELECT TO authenticated
  USING (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'));

CREATE POLICY "prereg_staff_update" ON public.student_preregistrations
  FOR UPDATE TO authenticated
  USING      (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'))
  WITH CHECK (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'));

CREATE POLICY "prereg_staff_delete" ON public.student_preregistrations
  FOR DELETE TO authenticated
  USING (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin','encargada'));


REVOKE INSERT ON public.student_preregistrations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_preregistrations TO authenticated, service_role;
DO $$
BEGIN
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
    pg_get_serial_sequence('public.student_preregistrations','id'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
