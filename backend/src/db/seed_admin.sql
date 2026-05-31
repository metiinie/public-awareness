INSERT INTO public.users (email, password, full_name, role)
VALUES 
('superadmin@civiceye.com', '$2b$10$TkwH4217rCyAQmpqFLz44R7vurK4W26hpda2vNNQpL', 'Super Administrator', 'SUPER_ADMIN'),
('admin@civiceye.com', '$2b$10$TkwH4217rCyAQmpqFLz44R7vurK4W26hpda2vNNQpL', 'System Admin', 'ADMIN')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.audit_logs (admin_id, action, reason, created_at)
SELECT id, 'SYSTEM_SEED', 'Seeded initial admin staff', NOW()
FROM public.users 
WHERE email = 'superadmin@civiceye.com'
AND NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'SYSTEM_SEED');
