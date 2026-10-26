import { createClient } from '@supabase/supabase-js';

/**
 * The project URL only, e.g. https://abcd.supabase.co. People often paste the
 * REST endpoint (…/rest/v1/) from the dashboard instead; the client adds its
 * own paths, so that broke every sign-in. Strip any such suffix.
 */
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/(rest|auth|storage)\/v1$/i, '')
  .replace(/\/+$/, '');
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('your_supabase_project_url')
);

class MockAuth {
  private listeners: Array<(event: string, session: any) => void> = [];

  private getStoredSession() {
    try {
      const sess = localStorage.getItem('mock_supabase_session');
      return sess ? JSON.parse(sess) : null;
    } catch {
      return null;
    }
  }

  private setStoredSession(session: any) {
    if (session) {
      localStorage.setItem('mock_supabase_session', JSON.stringify(session));
    } else {
      localStorage.removeItem('mock_supabase_session');
    }
  }

  private getStoredUsers() {
    try {
      const users = localStorage.getItem('mock_supabase_users');
      return users ? JSON.parse(users) : {};
    } catch {
      return {};
    }
  }

  private setStoredUsers(users: any) {
    localStorage.setItem('mock_supabase_users', JSON.stringify(users));
  }

  async getSession() {
    return { data: { session: this.getStoredSession() }, error: null };
  }

  onAuthStateChange(callback: (event: string, session: any) => void) {
    this.listeners.push(callback);
    const currentSession = this.getStoredSession();
    setTimeout(() => {
      callback(currentSession ? 'SIGNED_IN' : 'INITIAL_SESSION', currentSession);
    }, 0);
    
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter(l => l !== callback);
          }
        }
      }
    };
  }

  async signUp({ email, password, options }: any) {
    const users = this.getStoredUsers();
    if (users[email]) {
      return { data: { user: null, session: null }, error: { message: 'User already exists' } as any };
    }

    const user = {
      id: 'mock-user-' + Math.random().toString(36).substring(2, 10),
      email,
      user_metadata: options?.data || {},
      created_at: new Date().toISOString()
    };

    users[email] = { user, password };
    this.setStoredUsers(users);

    const session = {
      user,
      access_token: 'mock-token-' + Math.random().toString(36).substring(2),
      expires_in: 3600
    };
    this.setStoredSession(session);

    // Automatically create a profile row in mock_profiles
    const profiles = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
    const profile = {
      id: user.id,
      email: user.email,
      full_name: options?.data?.full_name || '',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    profiles.push(profile);
    localStorage.setItem('mock_profiles', JSON.stringify(profiles));

    // Notify listeners
    this.listeners.forEach(l => l('SIGNED_IN', session));

    return { data: { user, session }, error: null };
  }

  async signInWithPassword({ email, password }: any) {
    const users = this.getStoredUsers();
    const record = users[email];
    if (!record || record.password !== password) {
      return { data: { user: null, session: null }, error: { message: 'Invalid credentials' } as any };
    }

    const session = {
      user: record.user,
      access_token: 'mock-token-' + Math.random().toString(36).substring(2),
      expires_in: 3600
    };
    this.setStoredSession(session);

    // Notify listeners
    this.listeners.forEach(l => l('SIGNED_IN', session));

    return { data: { user: record.user, session }, error: null };
  }

  async signOut() {
    this.setStoredSession(null);
    this.listeners.forEach(l => l('SIGNED_OUT', null));
    return { error: null };
  }
}

class MockQueryBuilder {
  private table: string;
  private filters: Array<(item: any) => boolean> = [];
  private sortField: string | null = null;
  private sortAscending: boolean = true;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private insertData: any = null;
  private updateData: any = null;
  private isDelete: boolean = false;
  private upsertData: any = null;
  private selectFields: string = '*';

  constructor(table: string) {
    this.table = table;
  }

  select(fields?: string) {
    if (fields) this.selectFields = fields;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((item: any) => item[column] === value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sortField = column;
    this.sortAscending = options?.ascending !== false;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(data: any) {
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.updateData = data;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  upsert(data: any) {
    this.upsertData = data;
    return this;
  }

  // Make the builder thenable
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      const result = await this.execute();
      if (onfulfilled) {
        return onfulfilled(result);
      }
      return result;
    } catch (err) {
      if (onrejected) {
        return onrejected(err);
      }
      throw err;
    }
  }

  private async execute() {
    const key = `mock_${this.table}`;
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      items = [];
    }

    // Handle UPSERT (by id)
    if (this.upsertData !== null) {
      const now = new Date().toISOString();
      const existing = items.findIndex((item: any) => item.id === this.upsertData.id);
      if (existing >= 0) items[existing] = { ...items[existing], ...this.upsertData, updated_at: now };
      else items.push({ created_at: now, updated_at: now, ...this.upsertData });
      localStorage.setItem(key, JSON.stringify(items));
      return { data: this.upsertData, error: null };
    }

    // Handle INSERT
    if (this.insertData !== null) {
      const toInsert = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const inserted = toInsert.map((item: any) => {
        return {
          id: item.id || 'mock-id-' + Math.random().toString(36).substring(2, 10),
          uploaded_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...item
        };
      });
      items.push(...inserted);
      localStorage.setItem(key, JSON.stringify(items));
      const returnedData = Array.isArray(this.insertData) ? inserted : inserted[0];
      return { data: returnedData, error: null };
    }

    // Handle UPDATE
    if (this.updateData !== null) {
      const updatedItems = items.map((item: any) => {
        const matches = this.filters.every(f => f(item));
        if (matches) {
          return {
            ...item,
            ...this.updateData,
            updated_at: new Date().toISOString()
          };
        }
        return item;
      });
      localStorage.setItem(key, JSON.stringify(updatedItems));
      
      // Update the AuthContext profile cache if we updated our own profile
      if (this.table === 'profiles') {
        const activeSession = JSON.parse(localStorage.getItem('mock_supabase_session') || 'null');
        if (activeSession && activeSession.user) {
          const matchingUpdated = updatedItems.find((p: any) => p.id === activeSession.user.id);
          if (matchingUpdated) {
            activeSession.user.user_metadata = {
              ...activeSession.user.user_metadata,
              full_name: matchingUpdated.full_name
            };
            localStorage.setItem('mock_supabase_session', JSON.stringify(activeSession));
          }
        }
      }

      return { data: updatedItems, error: null };
    }

    // Handle DELETE
    if (this.isDelete) {
      const remaining = items.filter((item: any) => !this.filters.every(f => f(item)));
      localStorage.setItem(key, JSON.stringify(remaining));
      return { data: null, error: null };
    }

    // Handle SELECT
    let filtered = items.filter((item: any) => this.filters.every(f => f(item)));

    // Apply sorting
    if (this.sortField) {
      filtered.sort((a: any, b: any) => {
        const valA = a[this.sortField!];
        const valB = b[this.sortField!];
        if (valA < valB) return this.sortAscending ? -1 : 1;
        if (valA > valB) return this.sortAscending ? 1 : -1;
        return 0;
      });
    }

    // Resolve inner joins (e.g., profiles!inner(full_name, email))
    if (this.selectFields.includes('profiles')) {
      let profiles: any[] = [];
      try {
        profiles = JSON.parse(localStorage.getItem('mock_profiles') || '[]');
      } catch {
        profiles = [];
      }
      
      filtered = filtered.map((item: any) => {
        const profile = profiles.find((p: any) => p.id === item.user_id);
        return {
          ...item,
          profiles: profile ? {
            full_name: profile.full_name,
            email: profile.email
          } : {
            full_name: 'Unknown Artist',
            email: ''
          }
        };
      });
    }

    if (this.isSingle) {
      if (filtered.length === 0) {
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } as any };
      }
      return { data: filtered[0], error: null };
    }

    if (this.isMaybeSingle) {
      return { data: filtered[0] || null, error: null };
    }

    return { data: filtered, error: null };
  }
}

class MockStorageBucket {
  private bucketName: string;

  constructor(bucketName: string) {
    this.bucketName = bucketName;
  }

  async upload(path: string, file: File) {
    return new Promise<any>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        try {
          localStorage.setItem(`mock_storage_${this.bucketName}_${path}`, dataUrl);
          resolve({ data: { path }, error: null });
        } catch (e: any) {
          console.warn('Storage quota exceeded, storing in-memory only', e);
          (window as any)[`mock_storage_mem_${this.bucketName}_${path}`] = dataUrl;
          resolve({ data: { path }, error: null });
        }
      };
      reader.readAsDataURL(file);
    });
  }

  getPublicUrl(path: string) {
    let dataUrl = localStorage.getItem(`mock_storage_${this.bucketName}_${path}`);
    if (!dataUrl) {
      dataUrl = (window as any)[`mock_storage_mem_${this.bucketName}_${path}`];
    }
    const url = dataUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=600';
    return { data: { publicUrl: url } };
  }

  async remove(paths: string[]) {
    paths.forEach((path) => {
      localStorage.removeItem(`mock_storage_${this.bucketName}_${path}`);
      delete (window as any)[`mock_storage_mem_${this.bucketName}_${path}`];
    });
    return { data: null, error: null };
  }
}

class MockStorage {
  from(bucketName: string) {
    return new MockStorageBucket(bucketName);
  }
}

class MockSupabaseClient {
  auth = new MockAuth();
  storage = new MockStorage();

  from(table: string) {
    return new MockQueryBuilder(table);
  }
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (new MockSupabaseClient() as any);

export type ChainStatusValue = 'confirmed' | 'pending' | 'failed' | 'skipped';

export type ArtworkMetadata = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  image_url: string;
  hash: string;
  perceptual_hash: string | null;
  uploaded_at: string;
  // On-chain proof (see migration 20260803000000_add_blockchain_proof.sql)
  tx_hash: string | null;
  block_number: number | null;
  owner_address: string | null;
  chain_status: ChainStatusValue | null;
  chain_error: string | null;
  registered_at: string | null;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};