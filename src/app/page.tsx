"use client";
import { useRouter } from "next/navigation";
import { Upload, Eye, Box, Settings, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {}
            <nav
                className="bg-white/80 backdrop-blur-sm border-b border-blue-100 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Box className="w-6 h-6 text-blue-600" />
                        <span className="font-bold text-xl text-gray-900">医学3D模型系统</span>
                    </div>
                    <Button
                        variant="ghost"
                        onClick={() => router.push("/upload")}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                        <Settings className="w-4 h-4 mr-2" />配置管理
                                  </Button>
                </div>
            </nav>
            {}
            <main className="max-w-6xl mx-auto px-6 py-16">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">苏大附一院医学3D模型可视化平台</h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">上传您的STL格式三维医学模型，配置可视化参数，生成可分享的3D展示页面
                                  </p>
                </div>
                {}
                <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
                    {}
                    <Card
                        className="group hover:shadow-lg transition-all duration-300 hover:border-blue-300 cursor-pointer"
                        onClick={() => router.push("/upload")}>
                        <CardHeader>
                            <div
                                className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                                <Upload className="w-6 h-6 text-blue-600" />
                            </div>
                            <CardTitle>配置与上传</CardTitle>
                            <CardDescription>上传STL格式的3D模型文件，配置颜色、透明度等参数
                                              </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                className="w-full bg-blue-600 hover:bg-blue-700 group-hover:shadow-md transition-all"
                                onClick={() => router.push("/upload")}
                            >
                                开始配置
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Button>
                        </CardContent>
                    </Card>
                    {}
                    <Card
                        className="group hover:shadow-lg transition-all duration-300 hover:border-green-300">
                        <CardHeader>
                            <div
                                className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                                <Eye className="w-6 h-6 text-green-600" />
                            </div>
                            <CardTitle>3D模型展示</CardTitle>
                            <CardDescription>通过访问码查看已配置的3D医学模型展示页面
                                              </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-gray-500">
                                <p>请使用访问码访问展示页面</p>
                                <p className="font-mono mt-1">格式: /view?code=xxxxx</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                {}
                <Card className="max-w-4xl mx-auto bg-white/60 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">使用说明</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-3 gap-6 text-sm">
                            <div className="flex gap-3">
                                <div
                                    className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-blue-600 font-bold">1</span>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">上传模型文件</p>
                                    <p className="text-gray-500 mt-1">准备STL格式的3D模型文件</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div
                                    className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-blue-600 font-bold">2</span>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">配置参数</p>
                                    <p className="text-gray-500 mt-1">设置模型名称、颜色和透明度</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div
                                    className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-blue-600 font-bold">3</span>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">分享访问</p>
                                    <p className="text-gray-500 mt-1">获取访问链接，分享给用户</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                {}
                <div className="max-w-4xl mx-auto mt-8 text-center text-sm text-gray-400">
                    <p>规则：支持 STL 格式3D模型文件 | 最多20个模型 | 颜色与透明度自定义</p>
                </div>
            </main>
        </div>
    );
}