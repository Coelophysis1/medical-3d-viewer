import { NextRequest, NextResponse } from 'next/server';
import { verifyPatient } from '@/storage/database/patient-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone } = body;

    // 验证必填字段
    if (!name || !phone) {
      return NextResponse.json(
        { success: false, error: '请输入姓名和手机号' },
        { status: 400 }
      );
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { success: false, error: '手机号格式不正确' },
        { status: 400 }
      );
    }

    // 验证患者身份
    const patient = await verifyPatient(name, phone);

    if (!patient) {
      return NextResponse.json(
        { success: false, error: '未找到相关信息，请核对姓名和手机号' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        name: patient.name,
        // 手机号脱敏显示
        phone: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
      },
    });
  } catch (error) {
    console.error('验证患者身份失败:', error);
    return NextResponse.json(
      { success: false, error: '验证失败，请稍后重试' },
      { status: 500 }
    );
  }
}
