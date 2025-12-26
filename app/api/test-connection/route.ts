import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerComponentClient()
    
    // Test connection by querying a simple table
    const { data, error } = await supabase
      .from('staff')
      .select('count')
      .limit(1)

    if (error) {
      // Table might not exist yet, but connection works
      if (error.code === '42P01') {
        return NextResponse.json({
          success: true,
          message: 'Connected to Supabase. Database schema needs to be set up.',
          error: 'Table not found - please run schema.sql'
        })
      }
      
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully connected to Supabase!',
      data
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      details: 'Check environment variables and Supabase connection'
    }, { status: 500 })
  }
}

