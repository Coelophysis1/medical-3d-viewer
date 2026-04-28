import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  
  if (!authResult.success) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  
  return NextResponse.json({
    success: true,
    user: {
      id: authResult.user!.id,
      username: authResult.user!.username,
      role: authResult.user!.role,
    },
  });
}
