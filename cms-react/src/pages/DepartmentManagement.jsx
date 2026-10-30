import React from 'react';
import AdminReferenceManager from '../components/AdminReferenceManager';
import { createDepartment, listDepartments, updateDepartment } from '../services/adminService';

export default function DepartmentManagement() {
  return (
    <AdminReferenceManager
      title="Departments"
      subtitle="Create departments and deactivate or reactivate records without deleting staff history."
      entityLabel="department"
      idKey="department_id"
      nameKey="department_name"
      nameLabel="Department name"
      fetchItems={listDepartments}
      createItem={createDepartment}
      updateItem={updateDepartment}
    />
  );
}
