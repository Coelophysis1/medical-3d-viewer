import { NextRequest, NextResponse } from 'next/server';
import { getPatientConfigs, getPatientById } from '@/storage/database/patient-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json(
        { success: false, error: '无效的患者ID' },
        { status: 400 }
      );
    }

    // 获取患者信息
    const patient = await getPatientById(patientId);
    if (!patient) {
      return NextResponse.json(
        { success: false, error: '患者不存在' },
        { status: 404 }
      );
    }

    // 获取患者的所有模型配置
    const configs = await getPatientConfigs(patientId);

    // 格式化返回数据
    const formattedConfigs = configs.map(config => ({
      id: config.id,
      code: config.code,
      title: config.title,
      hospital: config.hospital,
      department: config.department,
      createdAt: config.created_at,
      modelCount: config.models.length,
    }));

    return NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        name: patient.name,
      },
      configs: formattedConfigs,
    });
  } catch (error) {
    console.error('获取患者模型列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取失败，请稍后重试' },
      { status: 500 }
    );
  }
}
