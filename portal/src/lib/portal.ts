import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type PortalRole = 'owner' | 'instructor' | 'student'

export interface PortalProfile {
  id: string
  email: string
  full_name: string
  role: PortalRole
  active: boolean
}

export interface PortalStudent {
  id: string
  email: string
  full_name: string
  active: boolean
  created_at: string
}

export interface PortalCourse {
  id: string
  name: string
  short_name: string
  active: boolean
  created_at: string
}

export interface StaffWorkspace {
  students: PortalStudent[]
  courses: PortalCourse[]
  stats: {
    students: number
    activeEnrollments: number
    courses: number
    draftGradeSheets: number
  }
}

export async function loadProfile(user: User): Promise<PortalProfile> {
  if (!supabase) throw new Error('The portal backend is not configured.')

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active')
    .eq('id', user.id)
    .single()

  if (error) throw error
  return data as PortalProfile
}

async function exactCount(table: 'profiles' | 'courses' | 'enrollments' | 'lesson_attempts', filters: Array<[string, string]>) {
  if (!supabase) return 0

  let query = supabase.from(table).select('*', { count: 'exact', head: true })
  filters.forEach(([column, value]) => {
    query = query.eq(column, value)
  })

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

export async function loadStaffWorkspace(): Promise<StaffWorkspace> {
  if (!supabase) throw new Error('The portal backend is not configured.')

  const [studentsResult, coursesResult, students, activeEnrollments, courses, draftGradeSheets] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, active, created_at')
      .eq('role', 'student')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('courses')
      .select('id, name, short_name, active, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    exactCount('profiles', [['role', 'student']]),
    exactCount('enrollments', [['status', 'active']]),
    exactCount('courses', [['active', 'true']]),
    exactCount('lesson_attempts', [['status', 'draft']]),
  ])

  if (studentsResult.error) throw studentsResult.error
  if (coursesResult.error) throw coursesResult.error

  return {
    students: (studentsResult.data ?? []) as PortalStudent[],
    courses: (coursesResult.data ?? []) as PortalCourse[],
    stats: { students, activeEnrollments, courses, draftGradeSheets },
  }
}
