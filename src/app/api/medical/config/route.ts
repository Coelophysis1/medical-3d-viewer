import { NextRequest, NextResponse } from 'next/server';
import { createMedicalConfig } from '@/storage/database/medical-service';
import { getOrCreatePatient } from '@/storage/database/patient-service';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // 验证登录状态
    const authResult = await requireAuth(request);
    
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || '请先登录' },
        { status: 401 }
      );
    }
    
    const currentUser = authResult.user;
    
    const body = await request.json();
    
    const { title, patient_name, patient_phone, patient_gender, patient_age, hospital, department, models } = body;
    
    // 验证必填项
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json(
        { success: false, error: '页面标题为必填项' },
        { status: 400 }
      );
    }

    // 验证患者年龄（如果提供）
    if (patient_age !== undefined && patient_age !== null && patient_age !== '') {
      const age = Number(patient_age);
      if (!Number.isInteger(age) || age <= 0) {
        return NextResponse.json(
          { success: false, error: '患者年龄必须为正整数' },
          { status: 400 }
        );
      }
    }
    
    if (!models || !Array.isArray(models) || models.length === 0) {
      return NextResponse.json(
        { success: false, error: '至少需要上传一个3D模型文件' },
        { status: 400 }
      );
    }
    
    // 验证每个模型
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      if (!model.name || model.name.trim() === '') {
        return NextResponse.json(
          { success: false, error: `第${i + 1}个模型名称不能为空` },
          { status: 400 }
        );
      }
      if (!model.file_path || model.file_path.trim() === '') {
        return NextResponse.json(
          { success: false, error: `第${i + 1}个模型文件路径不能为空` },
          { status: 400 }
        );
      }
    }

    // 如果有患者姓名和手机号，创建或获取患者
    let patientId: number | undefined = undefined;
    if (patient_name?.trim() && patient_phone?.trim()) {
      const patient = await getOrCreatePatient(patient_name.trim(), patient_phone.trim());
      patientId = patient.id;
    }
    
    const result = await createMedicalConfig({
      title: title.trim(),
      patient_id: patientId,
      creator_id: currentUser.id, // 记录创建者
      patient_name: patient_name?.trim() || undefined,
      patient_phone: patient_phone?.trim() || undefined,
      patient_gender: patient_gender?.trim() || undefined,
      patient_age: patient_age ? Number(patient_age) : undefined,
      hospital: hospital?.trim() || undefined,
      department: department?.trim() || undefined,
      models,
    });
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      code: result.code,
      url: result.url,
    });
    
  } catch (error) {
    console.error('Create config error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
