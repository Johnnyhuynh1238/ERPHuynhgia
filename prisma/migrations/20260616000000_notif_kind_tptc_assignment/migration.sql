-- Add tptc_assignment to StaffNotificationKind enum
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'tptc_assignment';
