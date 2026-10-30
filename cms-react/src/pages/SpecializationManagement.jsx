import React from 'react';
import AdminReferenceManager from '../components/AdminReferenceManager';
import { createSpecialization, listSpecializations, updateSpecialization } from '../services/adminService';

export default function SpecializationManagement() {
  return (
    <AdminReferenceManager
      title="Specializations"
      subtitle="Maintain the active specialization catalogue used by Doctor profiles."
      entityLabel="specialization"
      idKey="spec_id"
      nameKey="spec_name"
      nameLabel="Specialization name"
      fetchItems={listSpecializations}
      createItem={createSpecialization}
      updateItem={updateSpecialization}
    />
  );
}
