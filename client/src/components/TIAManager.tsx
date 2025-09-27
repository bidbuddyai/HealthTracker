import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import type { Activity, Relationship } from "@shared/schema";
import { AlertTriangle, Plus, ExternalLink, Clock, GitBranch, Zap, RefreshCw } from "lucide-react";

interface TIAManagerProps {
  projectId: string;
  activities: Activity[];
  relationships: Relationship[];
}

export default function TIAManager({ projectId, activities, relationships }: TIAManagerProps) {
  const [, setLocation] = useLocation();
  
  const handleOpenTIA = () => {
    setLocation(`/project/${projectId}/tia`);
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5" />
            <span>Time Impact Analysis</span>
          </div>
          <Button size="sm" onClick={handleOpenTIA} data-testid="button-open-tia">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open TIA Manager
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium">Delay Analysis</span>
              </div>
              <p className="text-xs text-gray-500">Analyze schedule delays and EOT claims</p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">Acceleration</span>
              </div>
              <p className="text-xs text-gray-500">Study schedule compression options</p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <GitBranch className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">What-If Analysis</span>
              </div>
              <p className="text-xs text-gray-500">Model multiple schedule scenarios</p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <RefreshCw className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium">Recovery Planning</span>
              </div>
              <p className="text-xs text-gray-500">Plan mitigation strategies</p>
            </div>
          </div>
          
          {/* Call to Action */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-orange-600" />
            <h3 className="text-lg font-medium mb-2">Advanced Time Impact Analysis</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-lg mx-auto">
              Perform comprehensive schedule impact analysis with delay modeling, fragnet insertion, 
              what-if scenarios, and recovery planning using industry-standard methodologies.
            </p>
            <Button 
              onClick={handleOpenTIA} 
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-launch-tia"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Launch TIA Manager
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}