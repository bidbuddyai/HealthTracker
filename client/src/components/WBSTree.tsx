import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Wbs, Activity, InsertWbs } from "@shared/schema";
import { 
  Users, 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Folder,
  FolderOpen,
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Download,
  Upload,
  Move,
  DollarSign,
  Activity as ActivityIcon,
  TrendingUp,
  AlertCircle,
  GripVertical
} from "lucide-react";

interface WBSTreeProps {
  wbs: Wbs[];
  activities: Activity[];
  projectId: string;
}

interface WBSNode extends Wbs {
  children?: WBSNode[];
  activityCount?: number;
  totalCost?: number;
  progress?: number;
  isExpanded?: boolean;
}

interface WBSFormData {
  code: string;
  name: string;
  parentId: string | null;
}

export default function WBSTree({ wbs: initialWbs, activities, projectId }: WBSTreeProps) {
  const { toast } = useToast();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showWbsDialog, setShowWbsDialog] = useState(false);
  const [editingWbs, setEditingWbs] = useState<Wbs | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOverNode, setDragOverNode] = useState<string | null>(null);
  const [formData, setFormData] = useState<WBSFormData>({
    code: "",
    name: "",
    parentId: null,
  });

  // Build hierarchical tree structure
  const buildTree = useCallback((items: Wbs[]): WBSNode[] => {
    const nodeMap = new Map<string, WBSNode>();
    const rootNodes: WBSNode[] = [];

    // First pass: create all nodes with rollup data
    items.forEach(item => {
      const itemActivities = activities.filter(a => a.wbsId === item.id);
      const node: WBSNode = {
        ...item,
        children: [],
        activityCount: itemActivities.length,
        totalCost: itemActivities.reduce((sum, a) => sum + (a.plannedCost || 0), 0),
        progress: itemActivities.length > 0 
          ? Math.round(itemActivities.reduce((sum, a) => sum + (a.percentComplete || 0), 0) / itemActivities.length)
          : 0
      };
      nodeMap.set(item.id, node);
    });

    // Second pass: build tree structure
    items.forEach(item => {
      const node = nodeMap.get(item.id)!;
      if (item.parentId) {
        const parent = nodeMap.get(item.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        } else {
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });

    // Third pass: rollup values from children
    const rollupValues = (node: WBSNode): void => {
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => rollupValues(child));
        
        // Rollup activity count
        const childActivityCount = node.children.reduce((sum, child) => 
          sum + (child.activityCount || 0), 0);
        node.activityCount = (node.activityCount || 0) + childActivityCount;
        
        // Rollup cost
        const childCost = node.children.reduce((sum, child) => 
          sum + (child.totalCost || 0), 0);
        node.totalCost = (node.totalCost || 0) + childCost;
        
        // Calculate weighted progress
        if (node.activityCount! > 0) {
          const directProgress = activities
            .filter(a => a.wbsId === node.id)
            .reduce((sum, a) => sum + (a.percentComplete || 0), 0);
          
          const childProgress = node.children.reduce((sum, child) => 
            sum + (child.progress || 0) * (child.activityCount || 0), 0);
          
          node.progress = Math.round((directProgress + childProgress) / node.activityCount!);
        }
      }
    };

    rootNodes.forEach(node => rollupValues(node));

    // Sort by sequence number
    const sortNodes = (nodes: WBSNode[]): void => {
      nodes.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      nodes.forEach(node => {
        if (node.children) {
          sortNodes(node.children);
        }
      });
    };

    sortNodes(rootNodes);
    return rootNodes;
  }, [activities]);

  const wbsTree = buildTree(initialWbs);

  // Create WBS mutation
  const createWbsMutation = useMutation({
    mutationFn: async (data: InsertWbs) => {
      return await apiRequest(`/api/projects/${projectId}/wbs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/wbs`] });
      toast({
        title: "Success",
        description: "WBS item created successfully",
      });
      setShowWbsDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create WBS item",
        variant: "destructive",
      });
    },
  });

  // Update WBS mutation
  const updateWbsMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Wbs> }) => {
      return await apiRequest(`/api/projects/${projectId}/wbs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/wbs`] });
      toast({
        title: "Success",
        description: "WBS item updated successfully",
      });
      setShowWbsDialog(false);
      setEditingWbs(null);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update WBS item",
        variant: "destructive",
      });
    },
  });

  // Delete WBS mutation
  const deleteWbsMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/projects/${projectId}/wbs/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/wbs`] });
      toast({
        title: "Success",
        description: "WBS item deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete WBS item",
        variant: "destructive",
      });
    },
  });

  // Move WBS mutation (for drag and drop)
  const moveWbsMutation = useMutation({
    mutationFn: async ({ id, newParentId }: { id: string; newParentId: string | null }) => {
      return await apiRequest(`/api/projects/${projectId}/wbs/${id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newParentId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/wbs`] });
      toast({
        title: "Success",
        description: "WBS item moved successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to move WBS item",
        variant: "destructive",
      });
    },
  });

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleNewWbs = (parentId: string | null = null) => {
    setFormData({
      code: "",
      name: "",
      parentId,
    });
    setEditingWbs(null);
    setShowWbsDialog(true);
  };

  const handleEditWbs = (node: WBSNode) => {
    setFormData({
      code: node.code,
      name: node.name,
      parentId: node.parentId,
    });
    setEditingWbs(node);
    setShowWbsDialog(true);
  };

  const handleDeleteWbs = (nodeId: string) => {
    if (confirm("Are you sure you want to delete this WBS item and all its children?")) {
      deleteWbsMutation.mutate(nodeId);
    }
  };

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    setDraggedNode(nodeId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverNode(nodeId);
  };

  const handleDragLeave = () => {
    setDragOverNode(null);
  };

  const handleDrop = (e: React.DragEvent, targetNodeId: string | null) => {
    e.preventDefault();
    if (draggedNode && draggedNode !== targetNodeId) {
      // Check if target is not a descendant of dragged node
      const isDescendant = (nodeId: string, ancestorId: string): boolean => {
        const findNode = (nodes: WBSNode[], id: string): WBSNode | null => {
          for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
              const found = findNode(node.children, id);
              if (found) return found;
            }
          }
          return null;
        };

        const checkDescendant = (node: WBSNode, targetId: string): boolean => {
          if (!node.children) return false;
          for (const child of node.children) {
            if (child.id === targetId) return true;
            if (checkDescendant(child, targetId)) return true;
          }
          return false;
        };

        const draggedWbs = findNode(wbsTree, ancestorId);
        return draggedWbs ? checkDescendant(draggedWbs, nodeId) : false;
      };

      if (!isDescendant(targetNodeId || "root", draggedNode)) {
        moveWbsMutation.mutate({ id: draggedNode, newParentId: targetNodeId });
      }
    }
    setDraggedNode(null);
    setDragOverNode(null);
  };

  const handleSubmit = () => {
    const data: InsertWbs = {
      projectId,
      code: formData.code,
      name: formData.name,
      parentId: formData.parentId,
      level: formData.parentId ? 
        (initialWbs.find(w => w.id === formData.parentId)?.level || 0) + 1 : 1,
      sequenceNumber: initialWbs.filter(w => w.parentId === formData.parentId).length + 1,
    };

    if (editingWbs) {
      updateWbsMutation.mutate({ 
        id: editingWbs.id, 
        updates: {
          code: formData.code,
          name: formData.name,
        }
      });
    } else {
      createWbsMutation.mutate(data);
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      parentId: null,
    });
    setEditingWbs(null);
  };

  const handleExport = (format: "json" | "csv" | "xml") => {
    // Export functionality would be implemented here
    toast({
      title: "Export",
      description: `Exporting WBS in ${format.toUpperCase()} format...`,
    });
  };

  const renderNode = (node: WBSNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNode === node.id;
    const isDragOver = dragOverNode === node.id;

    return (
      <div key={node.id} data-testid={`wbs-node-${node.id}`}>
        <div
          className={`
            flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 
            cursor-pointer transition-colors rounded-lg
            ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
            ${isDragOver ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-400' : ''}
          `}
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
          onClick={() => setSelectedNode(node.id)}
          draggable
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
        >
          <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
          
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-auto"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              data-testid={`toggle-expand-${node.id}`}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          )}
          
          {!hasChildren && <div className="w-4" />}

          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-orange-600" />
            ) : (
              <Folder className="w-4 h-4 text-orange-600" />
            )
          ) : (
            <FileText className="w-4 h-4 text-blue-600" />
          )}

          <div className="flex-1 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                {node.code}
              </span>
              <span className="font-medium">{node.name}</span>
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              {node.activityCount! > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <ActivityIcon className="w-3 h-3 mr-1" />
                  {node.activityCount}
                </Badge>
              )}
              
              {node.totalCost! > 0 && (
                <Badge variant="outline" className="text-xs">
                  <DollarSign className="w-3 h-3 mr-1" />
                  ${(node.totalCost! / 1000).toFixed(0)}k
                </Badge>
              )}
              
              {node.progress! > 0 && (
                <div className="flex items-center gap-2">
                  <Progress 
                    value={node.progress} 
                    className="w-16 h-2"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {node.progress}%
                  </span>
                </div>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`wbs-menu-${node.id}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNewWbs(node.id);
                    }}
                    data-testid={`add-child-${node.id}`}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Child
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditWbs(node);
                    }}
                    data-testid={`edit-wbs-${node.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      // Implement duplicate functionality
                      toast({
                        title: "Duplicate",
                        description: "Duplicating WBS item...",
                      });
                    }}
                    data-testid={`duplicate-${node.id}`}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteWbs(node.id);
                    }}
                    className="text-red-600"
                    data-testid={`delete-wbs-${node.id}`}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>Work Breakdown Structure</span>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-export-wbs">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("json")}>
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("csv")}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("xml")}>
                    Export as XML
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button 
                size="sm" 
                onClick={() => handleNewWbs(null)}
                data-testid="button-new-wbs"
              >
                <Plus className="w-4 h-4 mr-2" />
                New WBS
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wbsTree.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">WBS Structure</h3>
              <p className="text-sm mb-4">Hierarchical project breakdown coming soon</p>
              <div className="text-sm text-left max-w-md mx-auto space-y-2">
                <p>Features will include:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Hierarchical tree view</li>
                  <li>Drag-and-drop organization</li>
                  <li>Activity assignments</li>
                  <li>Cost and progress rollups</li>
                  <li>Export to various formats</li>
                </ul>
              </div>
              <Button 
                onClick={() => handleNewWbs(null)} 
                className="mt-6"
                data-testid="button-create-first-wbs"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First WBS Item
              </Button>
            </div>
          ) : (
            <div 
              className="space-y-1"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverNode(null);
              }}
              onDrop={(e) => handleDrop(e, null)}
            >
              {wbsTree.map(node => renderNode(node))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showWbsDialog} onOpenChange={setShowWbsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWbs ? "Edit WBS Item" : "Create WBS Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wbs-code">WBS Code</Label>
              <Input
                id="wbs-code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., 1.1, 1.2.1"
                data-testid="input-wbs-code"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="wbs-name">Name</Label>
              <Input
                id="wbs-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Site Preparation"
                data-testid="input-wbs-name"
              />
            </div>
            
            {!editingWbs && (
              <div className="space-y-2">
                <Label htmlFor="parent-wbs">Parent WBS</Label>
                <Select
                  value={formData.parentId || "root"}
                  onValueChange={(value) => 
                    setFormData({ ...formData, parentId: value === "root" ? null : value })
                  }
                >
                  <SelectTrigger id="parent-wbs" data-testid="select-parent-wbs">
                    <SelectValue placeholder="Select parent WBS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Root Level</SelectItem>
                    {initialWbs.map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.code} - {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowWbsDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.code || !formData.name}
              data-testid="button-save-wbs"
            >
              {editingWbs ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}