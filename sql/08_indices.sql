-- ============================================================
-- 08_indices.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 5 (INDICES DE RENDIMIENTO)
-- ============================================================
-- ============================================================
-- 5. INDICES DE RENDIMIENTO
-- ============================================================

-- school_years
CREATE INDEX IF NOT EXISTS idx_school_years_status ON public.school_years(status);
CREATE INDEX IF NOT EXISTS idx_school_years_is_current ON public.school_years(is_current) WHERE is_current = true;

-- payment_plans
CREATE INDEX IF NOT EXISTS idx_payment_plans_school_year ON public.payment_plans(school_year_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_level ON public.payment_plans(level);
CREATE INDEX IF NOT EXISTS idx_payment_plans_schedule ON public.payment_plans(schedule);
CREATE INDEX IF NOT EXISTS idx_payment_plans_active ON public.payment_plans(is_active) WHERE is_active = true AND deleted_at IS NULL;

-- plan_installments
CREATE INDEX IF NOT EXISTS idx_plan_installments_plan ON public.plan_installments(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_type ON public.plan_installments(type);

-- student_enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_school_year ON public.student_enrollments(school_year_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_classroom ON public.student_enrollments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.student_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_year ON public.student_enrollments(student_id, school_year_id);

-- student_charges
CREATE INDEX IF NOT EXISTS idx_charges_enrollment ON public.student_charges(student_enrollment_id);
CREATE INDEX IF NOT EXISTS idx_charges_installment ON public.student_charges(plan_installment_id);
CREATE INDEX IF NOT EXISTS idx_charges_status ON public.student_charges(status);
CREATE INDEX IF NOT EXISTS idx_charges_due_date ON public.student_charges(due_date) WHERE status IN ('pending','overdue');
CREATE INDEX IF NOT EXISTS idx_charges_type ON public.student_charges(type);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_charge ON public.payments(student_charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_month_paid ON public.payments(month_paid);
CREATE INDEX IF NOT EXISTS idx_payments_student_month ON public.payments(student_id, month_paid);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_month_status ON public.payments(month_paid, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_overdue_reminder ON public.payments(status, due_date, last_reminder_sent) WHERE status = 'overdue';
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date) WHERE deleted_at IS NULL AND status IN ('pending','overdue');
CREATE INDEX IF NOT EXISTS idx_payments_exclude_dgii ON public.payments(exclude_dgii) WHERE exclude_dgii = true;

-- students
CREATE INDEX IF NOT EXISTS idx_students_search_vector ON public.students USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_students_name_lower ON public.students(lower(name));
CREATE INDEX IF NOT EXISTS idx_students_parent ON public.students(parent_id);
CREATE INDEX IF NOT EXISTS idx_students_classroom ON public.students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_students_active_fee ON public.students(is_active, monthly_fee) WHERE is_active = true AND monthly_fee > 0;

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_search_vector ON public.profiles USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_name_lower ON public.profiles(lower(name));

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);

-- attendance
CREATE INDEX IF NOT EXISTS idx_attendance_classroom_date ON public.attendance(classroom_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, date);

-- posts
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_classroom_id ON public.posts(classroom_id) WHERE classroom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_period ON public.posts(period_id, classroom_id);

-- door_punches
CREATE INDEX IF NOT EXISTS idx_door_punches_date ON public.door_punches(date);
CREATE INDEX IF NOT EXISTS idx_door_punches_student ON public.door_punches(student_id, date);
CREATE INDEX IF NOT EXISTS idx_door_punches_staff ON public.door_punches(staff_id, date);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_period ON public.tasks(period_id, classroom_id);

-- grades
CREATE INDEX IF NOT EXISTS idx_grades_period ON public.grades(period_id, student_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_year ON public.grades(school_year_id);

-- report_cards
CREATE INDEX IF NOT EXISTS idx_report_cards_school_year ON public.report_cards(school_year_id);

-- login_attempts
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON public.login_attempts(email, created_at DESC, success);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_payload ON public.audit_logs USING GIN (payload jsonb_path_ops) WHERE payload IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_payment_id ON public.audit_logs((payload->>'payment_id'), created_at DESC) WHERE action LIKE 'payment.%';

-- system_errors
CREATE INDEX IF NOT EXISTS idx_system_errors_created_at ON public.system_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_user_id ON public.system_errors(user_id);

-- system_events
CREATE INDEX IF NOT EXISTS idx_system_events_payload ON public.system_events USING GIN (payload jsonb_path_ops) WHERE payload IS NOT NULL;

-- products
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_parent ON public.orders(parent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC) WHERE deleted_at IS NULL;

-- order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- inventory_movements
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at DESC);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_ncf ON public.invoices(ncf) WHERE ncf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_uuid_folio ON public.invoices(uuid_folio);
CREATE INDEX IF NOT EXISTS idx_invoices_sha256 ON public.invoices(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_invoices_pdf_url ON public.invoices(pdf_url) WHERE pdf_url IS NOT NULL;

-- parent_ratings
CREATE INDEX IF NOT EXISTS idx_parent_ratings_parent ON public.parent_ratings(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_ratings_teacher ON public.parent_ratings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_parent_ratings_month ON public.parent_ratings(month);

-- student_preregistrations
CREATE INDEX IF NOT EXISTS idx_preregistrations_status ON public.student_preregistrations(status);
CREATE INDEX IF NOT EXISTS idx_preregistrations_created ON public.student_preregistrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preregistrations_student_name ON public.student_preregistrations(lower(student_name));
CREATE INDEX IF NOT EXISTS idx_preregistrations_level ON public.student_preregistrations(level_requested);

-- classroom_events
CREATE INDEX IF NOT EXISTS idx_classroom_events_classroom ON public.classroom_events(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_events_date ON public.classroom_events(event_date);
CREATE INDEX IF NOT EXISTS idx_classroom_events_type ON public.classroom_events(event_type);

-- event_participants
CREATE INDEX IF NOT EXISTS idx_event_participants_event ON public.event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_student ON public.event_participants(student_id);

-- nap_sessions
CREATE INDEX IF NOT EXISTS idx_nap_sessions_student ON public.nap_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_nap_sessions_open ON public.nap_sessions(nap_end) WHERE nap_end IS NULL;

-- teacher_schedules
CREATE INDEX IF NOT EXISTS idx_teacher_schedules_classroom ON public.teacher_schedules(classroom_id);

-- schedule_event_logs
CREATE INDEX IF NOT EXISTS idx_schedule_event_logs_classroom_date ON public.schedule_event_logs(classroom_id, activated_at);
CREATE INDEX IF NOT EXISTS idx_schedule_event_logs_event_key ON public.schedule_event_logs(event_key);

-- accounting_journal
CREATE INDEX IF NOT EXISTS idx_journal_fecha ON public.accounting_journal(fecha);
CREATE INDEX IF NOT EXISTS idx_journal_tipo ON public.accounting_journal(tipo);

-- payroll_records
CREATE INDEX IF NOT EXISTS idx_payroll_period ON public.payroll_records(period);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON public.payroll_records(employee_id);

-- payment_concepts
CREATE INDEX IF NOT EXISTS idx_payment_concepts_active ON public.payment_concepts(is_active) WHERE is_active = true;

-- ============================================================
-- 5.1 INDICES CRITICOS FALTANTES
-- ============================================================

-- periods (usados en get_current_period, get_active_period, activate_period)
CREATE INDEX IF NOT EXISTS idx_periods_is_active ON public.periods(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_periods_status ON public.periods(status);
CREATE INDEX IF NOT EXISTS idx_periods_classroom ON public.periods(classroom_id);
CREATE INDEX IF NOT EXISTS idx_periods_school_year ON public.periods(school_year_id);

-- invoices (usados en get_invoices_by_student, get_invoices_by_payment)
CREATE INDEX IF NOT EXISTS idx_invoices_student_id ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON public.invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC);

-- messages (usados en get_unread_counts, mark_messages_read)
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(conversation_id, is_read) WHERE is_read = false;

-- grades (usados en close_period, historial estudiante)
CREATE INDEX IF NOT EXISTS idx_grades_student ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_classroom ON public.grades(classroom_id);

-- report_cards
CREATE INDEX IF NOT EXISTS idx_report_cards_student ON public.report_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_classroom ON public.report_cards(classroom_id);

-- classrooms (usados en RLS, teacher assignments, live)
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON public.classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_active ON public.classrooms(is_live) WHERE is_live = true;

-- incidents
CREATE INDEX IF NOT EXISTS idx_incidents_student ON public.incidents(student_id);
CREATE INDEX IF NOT EXISTS idx_incidents_classroom ON public.incidents(classroom_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);

-- comments
CREATE INDEX IF NOT EXISTS idx_comments_post ON public.comments(post_id);

-- attendance_requests
CREATE INDEX IF NOT EXISTS idx_attendance_requests_student ON public.attendance_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_status ON public.attendance_requests(status);

-- inquiries (usados en RLS parent_id)
CREATE INDEX IF NOT EXISTS idx_inquiries_parent ON public.inquiries(parent_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_student ON public.inquiries(student_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status);

-- staff_permits
CREATE INDEX IF NOT EXISTS idx_staff_permits_staff ON public.staff_permits(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_permits_status ON public.staff_permits(status);

-- daily_logs
CREATE INDEX IF NOT EXISTS idx_daily_logs_classroom ON public.daily_logs(classroom_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON public.daily_logs(date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_status ON public.daily_logs(status);

-- task_evidences
CREATE INDEX IF NOT EXISTS idx_task_evidences_student ON public.task_evidences(student_id);
CREATE INDEX IF NOT EXISTS idx_task_evidences_status ON public.task_evidences(status);

-- conversations
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_classroom ON public.conversations(classroom_id);

-- audit_logs (usados en busqueda por usuario/accion)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- nap_sessions (usados en daily routine por classroom)
CREATE INDEX IF NOT EXISTS idx_nap_sessions_classroom ON public.nap_sessions(classroom_id);

-- accounting_journal (usados en joins con payments)
CREATE INDEX IF NOT EXISTS idx_journal_payment_id ON public.accounting_journal(payment_id);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_student ON public.orders(student_id);

-- likes
CREATE INDEX IF NOT EXISTS idx_likes_user ON public.likes(user_id);

-- student_preregistrations (busqueda por email del padre)
CREATE INDEX IF NOT EXISTS idx_preregistrations_p1_email ON public.student_preregistrations(p1_email);

-- payments (indice compuesto para el padre: buscar pagos por estudiante + estado)
CREATE INDEX IF NOT EXISTS idx_payments_student_status ON public.payments(student_id, status) WHERE deleted_at IS NULL;

-- payments (indice para la cola de validacion)
CREATE INDEX IF NOT EXISTS idx_payments_pending_evidence ON public.payments(status, created_at DESC) WHERE evidence_url IS NOT NULL AND status IN ('pending','pendiente','review');

