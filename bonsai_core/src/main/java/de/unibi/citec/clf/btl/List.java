package de.unibi.citec.clf.btl;



import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.ListIterator;

/**
 * Generic type for lists of BTL types. Note that since the actual type of the
 * list elements is not known in a static context, calling the static methods
 * getBaseTag and fromElement could yield unexpected results. There is an
 * alternative getBaseTag(Class<T>) method that can be called with the element
 * type class and returns the base tag of the element type with the suffix LIST
 * appended to it.
 * 
 * @param <T>
 *            The type of the list elements.
 */
public class List<T extends Type> extends TypeCollection<T> implements java.util.List<T> {

	public java.util.List<T> elements = new ArrayList<>();

	@SuppressWarnings("unchecked")
	public static <T extends Type> Class<List<T>> getListClass(
			Class<T> type) {
		return (Class<List<T>>) new List<>(type).getClass();
	}

	/**
	 * Create a new list.
	 * 
	 * @param type
	 *            The type of the elements.
	 */
	public List(Class<T> type) {
	    super(type);
	    this.elements = new ArrayList<>();
	}
	
	   /**
     * Copy a list.
     * 
     */
    public List(List<T> list) {
        super(list);
        this.elements = new ArrayList<>(list.elements);
    }

	@Override
	public boolean add(T t) {
		return elements.add(t);
	}

	@Override
	public T get(int index) {
		return elements.get(index);
	}

	@Override
	public boolean contains(Object o) {
		return elements.contains(o);
	}

	@Override
	public int size() {
		return elements.size();
	}

	@Override
	public void add(int index, T element) {
		elements.add(index, element);
	}

	@Override
	public boolean addAll(Collection<? extends T> c) {
		return elements.addAll(c);
	}

	@Override
	public boolean addAll(int index, Collection<? extends T> c) {
		return elements.addAll(index, c);
	}

	@Override
	public void clear() {
		elements.clear();
	}

	@Override
	public boolean containsAll(Collection<?> c) {
		return elements.containsAll(c);
	}

	@Override
	public int indexOf(Object o) {
//            for(int i = 0 ; i < elements.size(); i ++){
//                if(o.equals(elements.get(i)))
//                    return i;
//            }
//            return -1;
            return elements.indexOf(o);
	}

	@Override
	public boolean isEmpty() {
		return elements.isEmpty();
	}

	@Override
	public Iterator<T> iterator() {
		return elements.iterator();
	}

	@Override
	public int lastIndexOf(Object o) {
		return elements.lastIndexOf(o);
	}

	@Override
	public ListIterator<T> listIterator() {
		return elements.listIterator();
	}

	@Override
	public ListIterator<T> listIterator(int index) {
		return elements.listIterator(index);
	}

	@Override
	public boolean remove(Object o) {
		return elements.remove(o);
	}

	@Override
	public T remove(int index) {
		return elements.remove(index);
	}

	@Override
	public boolean removeAll(Collection<?> c) {
		return elements.removeAll(c);
	}

	@Override
	public boolean retainAll(Collection<?> c) {
		return elements.retainAll(c);
	}

	@Override
	public T set(int index, T element) {
		return elements.set(index, element);
	}

	@Override
	public java.util.List<T> subList(int fromIndex, int toIndex) {
		return elements.subList(fromIndex, toIndex);
	}

	@Override
	public Object[] toArray() {
		return elements.toArray();
	}

	@Override
	public <T2> T2[] toArray(T2[] a) {
		return elements.toArray(a);
	}
	
    @Override
    public String toString() {
    	String s = "List<" + elementType.getSimpleName() + ">[";
    	boolean first = true;
    	for (T t : this) {
    		if (!first) {
    			s+= ",";
    		}
    		s += t.toString();
    		first = false;
    	}
    	s += "]";
    	return s;
    }
}
