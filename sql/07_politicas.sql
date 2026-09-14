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
  USING (COALESCE(get_my_role(),'') IN ('directora','asistente','admin','maestra'));
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
    AND student_id IN (SELECT parent_id FROM public.students WHERE parent_id = auth.uid())
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
