-- 1. Update user_role enum
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'user_role' AND e.enumlabel = 'MODERATOR') THEN
        ALTER TYPE user_role ADD VALUE 'MODERATOR';
    END IF;
END $$;

-- 2. Create account_status enum
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
        CREATE TYPE account_status AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');
    END IF;
END $$;

-- 3. Update users table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status') THEN
        ALTER TABLE users ADD COLUMN status account_status NOT NULL DEFAULT 'ACTIVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='suspension_until') THEN
        ALTER TABLE users ADD COLUMN suspension_until TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='created_at') THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- 4. Update categories table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='icon') THEN
        ALTER TABLE categories ADD COLUMN icon VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='is_active') THEN
        ALTER TABLE categories ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;
