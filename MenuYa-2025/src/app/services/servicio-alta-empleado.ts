import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';

interface Empleado {
  nombres: string;
  apellidos: string;
  dni: string;
  cuil: string;
  email: string;
  password: string;
  rol: string;
  foto?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class EmpleadoService {

  async registrarEmpleado(emp: Empleado) {

    //verificar si ya existe DNI, CUIL o Email
    const { data: existente, error: checkError } = await supabase
      .from('menuya_empleados')
      .select('id')
      .or(`dni.eq.${emp.dni},cuil.eq.${emp.cuil},email.eq.${emp.email}`)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existente) {
      throw new Error('Ya existe un empleado con ese DNI, CUIL o Email');
    }

    const { data, error } = await supabase.auth.signUp({
      email: emp.email,
      password: emp.password,
    });
    if (error) throw error;

    const userId = data.user?.id;
    if (!userId) throw new Error('No se pudo obtener el ID del usuario');

    const { error: dbError } = await supabase.from('menuya_empleados').insert([{
      auth_id: userId,
      nombre: emp.nombres,
      apellido: emp.apellidos,
      dni: emp.dni,
      cuil: emp.cuil,
      email: emp.email,
      rol: emp.rol,
      foto: emp.foto ?? null,
    }]);

    if (dbError) throw dbError;

    return true;
  }
}
